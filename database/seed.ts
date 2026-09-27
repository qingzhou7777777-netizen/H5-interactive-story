import {
  AccessMode,
  CompletionMode,
  ContentStatus,
  PrismaClient,
  StoryNodeType,
  VideoStatus,
} from "@prisma/client";

import {
  PAYMENT_OFFER_CODES,
  assertInitializationTargetEmpty,
  isMigrationPlaceholderStory,
  readBaseSeedConfig,
} from "./seed-config.js";

const prisma = new PrismaClient();

interface NodeSeed {
  code: string;
  title: string;
  nodeType: StoryNodeType;
  completionMode: CompletionMode;
  message?: string;
  videoAssetId?: string;
  nextNodeId?: string;
}

async function upsertNode(chapterId: string, node: NodeSeed) {
  return prisma.node.upsert({
    where: {
      chapterId_code: {
        chapterId,
        code: node.code,
      },
    },
    update: {
      title: node.title,
      message: node.message ?? null,
      completionMode: node.completionMode,
      nodeType: node.nodeType,
      videoAssetId: node.videoAssetId ?? null,
      nextNodeId: node.nextNodeId ?? null,
      accessMode: AccessMode.FREE,
      accessKey: null,
      status: ContentStatus.ACTIVE,
    },
    create: {
      chapterId,
      code: node.code,
      title: node.title,
      message: node.message ?? null,
      completionMode: node.completionMode,
      nodeType: node.nodeType,
      videoAssetId: node.videoAssetId ?? null,
      nextNodeId: node.nextNodeId ?? null,
      accessMode: AccessMode.FREE,
      status: ContentStatus.ACTIVE,
    },
  });
}

async function main() {
  const seedConfig = readBaseSeedConfig();
  if (seedConfig.mode === "initialize") {
    const [story, character, chapter, videoAssets, paymentOffers] = await Promise.all([
      prisma.story.findUnique({
        where: { code: "ai-romance-demo" },
        select: { id: true, code: true, title: true, description: true, status: true },
      }),
      prisma.character.findUnique({ where: { code: "lin-wan" }, select: { code: true } }),
      prisma.chapter.findUnique({ where: { code: "chapter-01" }, select: { code: true } }),
      prisma.videoAsset.findMany({
        where: { code: { in: [
          "chapter01-node001",
          "chapter01-node002",
          "chapter01-node003",
          "chapter01-node004",
        ] } },
        select: { code: true },
      }),
      prisma.testPaymentOffer.findMany({
        where: { code: { in: [...PAYMENT_OFFER_CODES] } },
        select: { code: true },
      }),
    ]);
    assertInitializationTargetEmpty([
      ...(story && !isMigrationPlaceholderStory(story) ? [`Story:${story.code}`] : []),
      ...(character ? [`Character:${character.code}`] : []),
      ...(chapter ? [`Chapter:${chapter.code}`] : []),
      ...videoAssets.map((asset) => `VideoAsset:${asset.code}`),
      ...paymentOffers.map((offer) => `TestPaymentOffer:${offer.code}`),
    ]);
  }

  const story = await prisma.story.upsert({
    where: { code: "ai-romance-demo" },
    update: {
      title: "AI 恋爱互动剧情",
      description: "用于互动视频链路验证的示例故事。",
      status: ContentStatus.ACTIVE,
    },
    create: {
      code: "ai-romance-demo",
      title: "AI 恋爱互动剧情",
      description: "用于互动视频链路验证的示例故事。",
      status: ContentStatus.ACTIVE,
    },
  });

  const character = await prisma.character.upsert({
    where: { code: "lin-wan" },
    update: {
      name: "林晚",
      description: "示例角色，仅用于验证剧情领域模型。",
      status: ContentStatus.ACTIVE,
    },
    create: {
      code: "lin-wan",
      name: "林晚",
      description: "示例角色，仅用于验证剧情领域模型。",
      status: ContentStatus.ACTIVE,
    },
  });

  const chapter = await prisma.chapter.upsert({
    where: { code: "chapter-01" },
    update: {
      title: "第一次见面",
      description: "入口视频连接三条分支视频及独立结局。",
      storyId: story.id,
      characterId: character.id,
      status: ContentStatus.ACTIVE,
    },
    create: {
      code: "chapter-01",
      title: "第一次见面",
      description: "入口视频连接三条分支视频及独立结局。",
      storyId: story.id,
      characterId: character.id,
      status: ContentStatus.ACTIVE,
    },
  });

  const testVideoAssets = {
    Node001: {
      fileSize: 76144n,
      checksum: "2468c454d535b0c1ee92ed1fcbe6c6a661f3d2e87a5ea15bdd409238917d6e48",
    },
    Node002: {
      fileSize: 76194n,
      checksum: "dfb21da30f54c4daabb0066fedbfd31211ac51c44851341427991bb0b7786a43",
    },
    Node003: {
      fileSize: 76200n,
      checksum: "83e822c931d7fac84e96676a15f404aadc1696c971876808ce1e9e048d521e42",
    },
    Node004: {
      fileSize: 76228n,
      checksum: "d20fb86d7f59f9a37ed4b7f0e5d1d423185dd206d2002cdde8559c2769ddbf2d",
    },
  } as const;
  const videoAssets = new Map<string, { id: string }>();

  for (const nodeId of ["Node001", "Node002", "Node003", "Node004"] as const) {
    const nodeNumber = nodeId.slice(-3);
    const testAsset = testVideoAssets[nodeId];
    const code = `chapter01-${nodeId.toLowerCase()}`;
    const existingAsset = await prisma.videoAsset.findUnique({ where: { code } });
    const asset = existingAsset ?? await prisma.videoAsset.create({
      data: {
        code,
        originalFilename: `${nodeId}.mp4`,
        objectKey: `test/chapter01/${nodeId}.mp4`,
        playbackPath: `/media/chapter01/${nodeId}.mp4`,
        posterPath: `/posters/node${nodeNumber}.svg`,
        mimeType: "video/mp4",
        fileSize: testAsset.fileSize,
        durationMs: 4000,
        width: 720,
        height: 1280,
        checksum: testAsset.checksum,
        videoCodec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        frameRate: 30,
        processingError: null,
        status: VideoStatus.READY,
      },
    });
    if (existingAsset) {
      console.info(`保留既有 VideoAsset ${code}，未覆盖播放、封面或对象存储字段。`);
    }
    videoAssets.set(nodeId, asset);
  }

  const ending002 = await upsertNode(chapter.id, {
    code: "Ending002",
    title: "解锁下一章",
    message: "解锁下一章，继续你的专属恋爱互动剧情。",
    nodeType: StoryNodeType.ENDING,
    completionMode: CompletionMode.END,
  });
  const ending003 = await upsertNode(chapter.id, {
    code: "Ending003",
    title: "解锁下一章",
    message: "解锁下一章，继续你的专属恋爱互动剧情。",
    nodeType: StoryNodeType.ENDING,
    completionMode: CompletionMode.END,
  });
  const ending004 = await upsertNode(chapter.id, {
    code: "Ending004",
    title: "解锁下一章",
    message: "解锁下一章，继续你的专属恋爱互动剧情。",
    nodeType: StoryNodeType.ENDING,
    completionMode: CompletionMode.END,
  });

  const paymentOffers = [ending002, ending003, ending004].map((ending) => {
    const code = `chapter01-${ending.code.toLowerCase()}-unlock`;
    return {
      code,
      triggerNodeId: ending.id,
      status: seedConfig.activePaymentOfferCodes.has(code)
        ? ContentStatus.ACTIVE
        : ContentStatus.DISABLED,
    };
  });

  for (const offer of paymentOffers) {
    await prisma.testPaymentOffer.upsert({
      where: { code: offer.code },
      update: {
        chapterId: chapter.id,
        triggerNodeId: offer.triggerNodeId,
        title: "解锁下一章",
        description: "这是付费意向测试，不会产生扣款或发放正式权益。",
        buttonLabel: "¥9.90 解锁下一章",
        priceMinor: 990,
        currency: "CNY",
        status: offer.status,
      },
      create: {
        code: offer.code,
        chapterId: chapter.id,
        triggerNodeId: offer.triggerNodeId,
        title: "解锁下一章",
        description: "这是付费意向测试，不会产生扣款或发放正式权益。",
        buttonLabel: "¥9.90 解锁下一章",
        priceMinor: 990,
        currency: "CNY",
        status: offer.status,
      },
    });
  }

  const node002 = await upsertNode(chapter.id, {
    code: "Node002",
    title: "去图书馆",
    nodeType: StoryNodeType.VIDEO,
    completionMode: CompletionMode.NEXT,
    videoAssetId: videoAssets.get("Node002")!.id,
    nextNodeId: ending002.id,
  });
  const node003 = await upsertNode(chapter.id, {
    code: "Node003",
    title: "一起去游泳",
    nodeType: StoryNodeType.VIDEO,
    completionMode: CompletionMode.NEXT,
    videoAssetId: videoAssets.get("Node003")!.id,
    nextNodeId: ending003.id,
  });
  const node004 = await upsertNode(chapter.id, {
    code: "Node004",
    title: "去水上乐园",
    nodeType: StoryNodeType.VIDEO,
    completionMode: CompletionMode.NEXT,
    videoAssetId: videoAssets.get("Node004")!.id,
    nextNodeId: ending004.id,
  });
  const node001 = await upsertNode(chapter.id, {
    code: "Node001",
    title: "第一次见面",
    nodeType: StoryNodeType.VIDEO,
    completionMode: CompletionMode.CHOICES,
    videoAssetId: videoAssets.get("Node001")!.id,
  });

  const choices = [
    { code: "A", label: "去图书馆", targetNodeId: node002.id, sortOrder: 1 },
    { code: "B", label: "一起去游泳", targetNodeId: node003.id, sortOrder: 2 },
    { code: "C", label: "去水上乐园", targetNodeId: node004.id, sortOrder: 3 },
  ] as const;

  for (const choice of choices) {
    await prisma.choice.upsert({
      where: {
        sourceNodeId_code: {
          sourceNodeId: node001.id,
          code: choice.code,
        },
      },
      update: {
        label: choice.label,
        targetNodeId: choice.targetNodeId,
        sortOrder: choice.sortOrder,
        enabled: true,
      },
      create: {
        sourceNodeId: node001.id,
        code: choice.code,
        label: choice.label,
        targetNodeId: choice.targetNodeId,
        sortOrder: choice.sortOrder,
        enabled: true,
      },
    });
  }

  await prisma.node.updateMany({
    where: {
      chapterId: chapter.id,
      code: {
        notIn: [
          "Node001",
          "Node002",
          "Node003",
          "Node004",
          "Ending002",
          "Ending003",
          "Ending004",
        ],
      },
    },
    data: { status: ContentStatus.DISABLED },
  });

  await prisma.choice.updateMany({
    where: {
      sourceNodeId: node001.id,
      code: { notIn: ["A", "B", "C"] },
    },
    data: { enabled: false },
  });

  await prisma.chapter.update({
    where: { id: chapter.id },
    data: { entryNodeId: node001.id },
  });

  console.info(
    `示例剧情已写入：1 Story、1 Chapter、7 Nodes、3 Choices、4 VideoAssets、` +
      `3 TestPaymentOffers（${seedConfig.activePaymentOfferCodes.size} ACTIVE）。`,
  );
  console.info("视频使用本地联调测试资源；正式素材交付后仍需替换 VideoAsset 播放与封面路径。");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
