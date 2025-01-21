import {
  createContext,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
  Dispatch,
} from "react";

import {
  CommandData,
  PullMessage,
  PullReply,
  PushMessage,
  PushReply,
} from "../types";
import { useEventCallback, useValueRef } from "../utils/hooks";
import {
  ClientState,
  PersistedClientState,
  initializeState,
  persistedState,
  reducer,
  nextActionLabel,
  ClientPushedState,
} from "./client_context/state";

export type ClientContext = {
  state: ClientState;
  nextLabel: string;
  nextDisabled: boolean;
  onNextClick: () => void;
  onInterruptClick: () => void;
  onDisconnectClick: () => void;
  onReconnectClick: () => void;
  addCommand: (command: CommandData) => void;
  pushBatchSize: number;
  setPushBatchSize: Dispatch<SetStateAction<number>>;
  persistedState: PersistedClientState;
};

const context = createContext<ClientContext>(undefined!);

export function useClientContext(): ClientContext {
  return useContext(context);
}

export type ClientProviderProps = {
  connected: boolean;
  initialState: PersistedClientState;
  onDisconnect: () => void;
  onReconnect: () => void;
  send: (message: PushMessage | PullMessage) => void;
  subscribe: (listener: (payload: PushReply | PullReply) => void) => () => void;
  children: ReactNode;
};

export function ClientProvider({
  connected,
  initialState,
  onDisconnect,
  onReconnect,
  send,
  subscribe,
  children,
}: ClientProviderProps) {
  const [waitingForReply, setWaitingForReply] = useState(false);
  const messageHandlerRef = useRef<
    ((payload: PushReply | PullReply) => void) | null
  >(null);
  const setMessageHandler = useCallback(
    (handler: ((payload: PushReply | PullReply) => void) | null): void => {
      if (handler) {
        setWaitingForReply(true);
        messageHandlerRef.current = (payload) => {
          handler(payload);
          setWaitingForReply(false);
          messageHandlerRef.current = null;
        };
      } else {
        setWaitingForReply(false);
        messageHandlerRef.current = null;
      }
    },
    []
  );

  const [state, dispatch] = useReducer(reducer, initialState, initializeState);

  const subscribeFn = useEventCallback(subscribe);

  useEffect(() => {
    dispatch({ type: "connectionChanged", connected });

    if (connected) {
      return subscribeFn((reply) => {
        if (messageHandlerRef.current) {
          messageHandlerRef.current(reply);
        }
      });
    } else {
      setMessageHandler(null);
    }
  }, [connected, subscribeFn, setMessageHandler]);

  const [pushBatchSize, setPushBatchSize] = useState(10);
  const [lastPull, setLastPull] = useState<PullReply | null>(null);

  const nextLabel = nextActionLabel(state);
  const nextDisabled = !connected || waitingForReply;

  const onNextClick = useEventCallback(() => {
    if (!connected || waitingForReply) return;

    switch (state.nextActionType) {
      case "sentCommandBatch":
        dispatch({
          topic: "PUSH",
          type: "sentCommandBatch",
          limit: pushBatchSize,
        });
        break;

      case "commandsAcked":
      case "deletedCommands":
        dispatch({ topic: "PUSH", type: state.nextActionType });
        break;

      case "sentPull":
      case "upsertedBatch":
        dispatch({ topic: "PULL", type: state.nextActionType });
        break;

      case "pullReceived":
        dispatch({
          topic: "PULL",
          type: "pullReceived",
          locationId: lastPull!.locationId,
          records: lastPull!.records,
          nextCursor: lastPull!.nextCursor,
        });
        setLastPull(null);
        break;
    }
  });

  const step = "step" in state ? state.step : undefined;

  const stateRef = useValueRef(state);
  const sendRef = useValueRef(send);

  useEffect(() => {
    const state = stateRef.current;
    const send = sendRef.current;

    switch (step) {
      case "awaitingAck":
        setMessageHandler((payload) => {
          // nothing to do
          console.log(payload);
        });
        send({
          topic: "PUSH",
          commands: (state as ClientPushedState).lastBatch,
        });
        break;

      case "awaitingBatch":
        setMessageHandler((payload) => setLastPull(payload as PullReply));
        send({
          topic: "PULL",
          locationId: state.activeLocationId,
          cursor: state.cursor,
        });
        break;
    }
  }, [step, stateRef, sendRef, setMessageHandler]);

  const onInterruptClick = useCallback((): void => {
    dispatch({ type: "interrupted" });
  }, []);

  const onDisconnectClick = useEventCallback(onDisconnect);
  const onReconnectClick = useEventCallback(onReconnect);

  const addCommand = useCallback((command: CommandData): void => {
    dispatch({ type: "command", command });
  }, []);

  const persistedStateValue = useMemo(() => persistedState(state), [state]);

  const contextValue = useMemo<ClientContext>(
    () => ({
      state,
      nextLabel,
      nextDisabled,
      onNextClick,
      onInterruptClick,
      onDisconnectClick,
      onReconnectClick,
      addCommand,
      pushBatchSize,
      setPushBatchSize,
      persistedState: persistedStateValue,
    }),
    [
      state,
      nextLabel,
      nextDisabled,
      onNextClick,
      onInterruptClick,
      onDisconnectClick,
      onReconnectClick,
      addCommand,
      pushBatchSize,
      setPushBatchSize,
      persistedStateValue,
    ]
  );

  return <context.Provider value={contextValue}>{children}</context.Provider>;
}
