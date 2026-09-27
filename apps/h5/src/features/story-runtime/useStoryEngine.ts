import {
  StoryEngine,
  StoryEngineError,
  type RuntimeStoryDefinition,
  type StoryRuntimeState,
} from "@interactive-story/story-core";
import { useCallback, useEffect, useRef, useState } from "react";

export const LOCAL_STORY_PROGRESS_KEY = "interactive-story:local-test-story:v2";

export function getStoryProgressKey(storyId: string) {
  return `interactive-story:${storyId}:v1`;
}

interface UseStoryEngineOptions {
  storageKey?: string;
  initialSnapshot?: unknown;
  persistLocally?: boolean;
}

interface InitializedRuntime {
  engine: StoryEngine;
  state: StoryRuntimeState;
  error: string | null;
}

function getLocalStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "剧情运行时发生未知错误。";
}

function initializeRuntime(
  story: RuntimeStoryDefinition,
  storageKey: string,
  initialSnapshot: unknown,
): InitializedRuntime {
  const storage = getLocalStorage();
  const engine = new StoryEngine(story);

  if (initialSnapshot !== undefined) {
    try {
      return {
        engine,
        state: engine.restore(initialSnapshot),
        error: null,
      };
    } catch (error) {
      return {
        engine,
        state: engine.getState(),
        error: `服务端剧情记录无效：${getErrorMessage(error)}`,
      };
    }
  }

  const savedProgress = storage?.getItem(storageKey);

  if (savedProgress) {
    try {
      return {
        engine,
        state: engine.restore(JSON.parse(savedProgress) as unknown),
        error: null,
      };
    } catch (error) {
      storage?.removeItem(storageKey);

      const fallbackEngine = new StoryEngine(story);
      try {
        return {
          engine: fallbackEngine,
          state: fallbackEngine.start(),
          error: `本地剧情记录无效，已重新开始：${getErrorMessage(error)}`,
        };
      } catch (fallbackError) {
        return {
          engine: fallbackEngine,
          state: fallbackEngine.getState(),
          error: `剧情无法启动：${getErrorMessage(fallbackError)}`,
        };
      }
    }
  }

  try {
    return {
      engine,
      state: engine.start(),
      error: null,
    };
  } catch (error) {
    return {
      engine,
      state: engine.getState(),
      error: `剧情无法启动：${getErrorMessage(error)}`,
    };
  }
}

export function useStoryEngine(
  story: RuntimeStoryDefinition,
  options: UseStoryEngineOptions = {},
) {
  const storageKey = options.storageKey ?? LOCAL_STORY_PROGRESS_KEY;
  const persistLocally = options.persistLocally ?? true;
  const [initialRuntime] = useState(() =>
    initializeRuntime(story, storageKey, options.initialSnapshot),
  );
  const engineRef = useRef(initialRuntime.engine);
  const [state, setState] = useState(initialRuntime.state);
  const [error, setError] = useState<string | null>(initialRuntime.error);

  useEffect(() => {
    if (!persistLocally) {
      return;
    }
    const snapshot = engineRef.current.getSnapshot();
    if (!snapshot) {
      return;
    }

    try {
      getLocalStorage()?.setItem(storageKey, JSON.stringify(snapshot));
    } catch (storageError) {
      setError(`本地剧情进度保存失败：${getErrorMessage(storageError)}`);
    }
  }, [persistLocally, state, storageKey]);

  const applyTransition = useCallback(
    (transition: (engine: StoryEngine) => StoryRuntimeState) => {
      try {
        const nextState = transition(engineRef.current);
        setState(nextState);
        setError(null);
      } catch (transitionError) {
        const prefix =
          transitionError instanceof StoryEngineError
            ? `剧情操作失败（${transitionError.code}）`
            : "剧情操作失败";
        setError(`${prefix}：${getErrorMessage(transitionError)}`);
      }
    },
    [],
  );

  const completeVideo = useCallback(() => {
    applyTransition((engine) => engine.completeVideo());
  }, [applyTransition]);

  const selectChoice = useCallback(
    (choiceId: string) => {
      applyTransition((engine) => engine.selectChoice(choiceId));
    },
    [applyTransition],
  );

  const restoreSnapshot = useCallback(
    (snapshot: unknown) => {
      const nextEngine = new StoryEngine(story);
      try {
        const nextState = nextEngine.restore(snapshot);
        engineRef.current = nextEngine;
        setState(nextState);
        setError(null);
      } catch (restoreError) {
        setError(`服务端剧情记录无效：${getErrorMessage(restoreError)}`);
      }
    },
    [story],
  );

  const restart = useCallback(() => {
    const nextEngine = new StoryEngine(story);
    getLocalStorage()?.removeItem(storageKey);

    try {
      const nextState = nextEngine.start();
      engineRef.current = nextEngine;
      setState(nextState);
      setError(null);
    } catch (restartError) {
      engineRef.current = nextEngine;
      setState(nextEngine.getState());
      setError(`剧情无法重新开始：${getErrorMessage(restartError)}`);
    }
  }, [storageKey, story]);

  return {
    state,
    error,
    completeVideo,
    selectChoice,
    restoreSnapshot,
    restart,
    clearError: () => setError(null),
  };
}
