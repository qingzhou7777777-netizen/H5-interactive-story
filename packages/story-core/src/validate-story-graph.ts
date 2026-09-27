import type {
  StoryChoiceDefinition,
  StoryGraph,
  StoryNodeDefinition,
} from "./types.js";

export type StoryValidationIssueCode =
  | "duplicate_node_code"
  | "entry_node_missing"
  | "choice_source_missing"
  | "choice_target_missing"
  | "choices_required"
  | "next_node_required"
  | "next_node_missing"
  | "end_node_has_next"
  | "choice_node_requires_choices_mode"
  | "ending_node_requires_end_mode"
  | "payment_access_key_required"
  | "duplicate_choice_code"
  | "duplicate_choice_order";

export interface StoryValidationIssue {
  code: StoryValidationIssueCode;
  message: string;
  nodeCode?: string;
  choiceCode?: string;
}

function validateNode(
  node: StoryNodeDefinition,
  nodeCodes: ReadonlySet<string>,
  enabledChoices: readonly StoryChoiceDefinition[],
) {
  const issues: StoryValidationIssue[] = [];

  if (node.type === "choice" && node.completionMode !== "choices") {
    issues.push({
      code: "choice_node_requires_choices_mode",
      nodeCode: node.code,
      message: `选择节点 ${node.code} 必须使用 choices 完成模式。`,
    });
  }

  if (node.type === "ending" && node.completionMode !== "end") {
    issues.push({
      code: "ending_node_requires_end_mode",
      nodeCode: node.code,
      message: `结束节点 ${node.code} 必须使用 end 完成模式。`,
    });
  }

  if (node.completionMode === "choices" && enabledChoices.length === 0) {
    issues.push({
      code: "choices_required",
      nodeCode: node.code,
      message: `节点 ${node.code} 使用 choices 模式，但没有启用的选项。`,
    });
  }

  if (node.completionMode === "next") {
    if (!node.nextNodeCode) {
      issues.push({
        code: "next_node_required",
        nodeCode: node.code,
        message: `节点 ${node.code} 使用 next 模式，但没有配置下一节点。`,
      });
    } else if (!nodeCodes.has(node.nextNodeCode)) {
      issues.push({
        code: "next_node_missing",
        nodeCode: node.code,
        message: `节点 ${node.code} 指向不存在的节点 ${node.nextNodeCode}。`,
      });
    }
  }

  if (node.completionMode === "end" && node.nextNodeCode) {
    issues.push({
      code: "end_node_has_next",
      nodeCode: node.code,
      message: `结束节点 ${node.code} 不应配置下一节点。`,
    });
  }

  if (node.accessMode === "payment" && !node.accessKey) {
    issues.push({
      code: "payment_access_key_required",
      nodeCode: node.code,
      message: `受限节点 ${node.code} 必须配置 accessKey。`,
    });
  }

  return issues;
}

export function validateStoryGraph(graph: StoryGraph) {
  const issues: StoryValidationIssue[] = [];
  const nodeCodes = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeCodes.has(node.code)) {
      issues.push({
        code: "duplicate_node_code",
        nodeCode: node.code,
        message: `节点编码 ${node.code} 重复。`,
      });
    }
    nodeCodes.add(node.code);
  }

  if (!nodeCodes.has(graph.chapter.entryNodeCode)) {
    issues.push({
      code: "entry_node_missing",
      nodeCode: graph.chapter.entryNodeCode,
      message: `章节入口节点 ${graph.chapter.entryNodeCode} 不存在。`,
    });
  }

  const choiceCodesBySource = new Map<string, Set<string>>();
  const choiceOrdersBySource = new Map<string, Set<number>>();

  for (const choice of graph.choices) {
    if (!nodeCodes.has(choice.sourceNodeCode)) {
      issues.push({
        code: "choice_source_missing",
        choiceCode: choice.code,
        message: `选项 ${choice.code} 的来源节点 ${choice.sourceNodeCode} 不存在。`,
      });
    }

    if (!nodeCodes.has(choice.targetNodeCode)) {
      issues.push({
        code: "choice_target_missing",
        choiceCode: choice.code,
        message: `选项 ${choice.code} 的目标节点 ${choice.targetNodeCode} 不存在。`,
      });
    }

    const sourceCodes = choiceCodesBySource.get(choice.sourceNodeCode) ?? new Set<string>();
    if (sourceCodes.has(choice.code)) {
      issues.push({
        code: "duplicate_choice_code",
        choiceCode: choice.code,
        message: `节点 ${choice.sourceNodeCode} 下的选项编码 ${choice.code} 重复。`,
      });
    }
    sourceCodes.add(choice.code);
    choiceCodesBySource.set(choice.sourceNodeCode, sourceCodes);

    const sourceOrders =
      choiceOrdersBySource.get(choice.sourceNodeCode) ?? new Set<number>();
    if (sourceOrders.has(choice.sortOrder)) {
      issues.push({
        code: "duplicate_choice_order",
        choiceCode: choice.code,
        message: `节点 ${choice.sourceNodeCode} 下的选项顺序 ${choice.sortOrder} 重复。`,
      });
    }
    sourceOrders.add(choice.sortOrder);
    choiceOrdersBySource.set(choice.sourceNodeCode, sourceOrders);
  }

  for (const node of graph.nodes) {
    const enabledChoices = graph.choices.filter(
      (choice) => choice.sourceNodeCode === node.code && choice.enabled,
    );
    issues.push(...validateNode(node, nodeCodes, enabledChoices));
  }

  return issues;
}
