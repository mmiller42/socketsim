import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { omit } from "lodash-es";

import { ClientProvider, useClientContext } from "../contexts/client_context";
import {
  CommandData,
  PullMessage,
  PullReply,
  PushMessage,
  PushReply,
} from "../types";
import { PersistedClientState } from "../contexts/client_context/state";
import { useEventCallback } from "../utils/hooks";

export type ClientContainerProps = ClientProps & {
  initialState: PersistedClientState;
};

const SOCKET_URL = "wss://somewhere";

async function createSocket(): Promise<WebSocket> {
  return new WebSocket(SOCKET_URL);
}

export function ClientContainer({
  clientId,
  initialState,
  onPersistedStateChange,
  onDelete,
}: ClientContainerProps) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [listeners, setListeners] = useState<
    Set<(payload: PushReply | PullReply) => void>
  >(new Set());
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  const subscribe = useCallback(
    (listener: (payload: PushReply | PullReply) => void): (() => void) => {
      setListeners((listeners) => listeners.add(listener));

      return () => {
        setListeners((listeners) => {
          listeners.delete(listener);
          return listeners;
        });
      };
    },
    []
  );

  const send = useCallback(
    (message: PushMessage | PullMessage): void => {
      if (socket && connected) {
        socket.send(JSON.stringify(message));
        console.info(`[${clientId}] sent message:`, message);
      }
    },
    [socket, connected, clientId]
  );

  const onDisconnect = useCallback(() => {
    socket?.close();
  }, [socket]);

  const onReconnect = useCallback(() => {
    createSocket()
      .then((socket) => {
        setSocket((current) => {
          if (current) return current;
          return socket;
        });
      })
      .catch((e) => {
        console.error(`[${clientId}] createSocket error:`, e);
      });
  }, [clientId]);

  useEffect(() => {
    onReconnect();
  }, [onReconnect]);

  useEffect(() => {
    if (!socket) return;

    const handleOpen = () => {
      setConnected(true);
      console.info(`[${clientId}] socket opened`);
    };
    const handleClose = () => {
      setSocket(null);
      setConnected(false);
      console.info(`[${clientId}] socket closed`);
    };
    const handleMessage = (event: MessageEvent<string>) => {
      let reply: PushReply | PullReply;
      try {
        reply = JSON.parse(event.data);
      } catch {
        console.error(`[${clientId}] unexpected message:`, event.data);
        return;
      }

      if (
        reply === null ||
        typeof reply !== "object" ||
        typeof reply.topic !== "string"
      ) {
        console.error(`[${clientId}] unexpected message:`, reply);
        return;
      }

      if ((reply.topic as string) === "PONG") {
        console.info(`[${clientId}] received PONG:`, reply);
        return;
      } else if (!["PUSH", "PULL"].includes(reply.topic)) {
        console.error(`[${clientId}] unexpected message:`, reply);
        return;
      }

      console.info(`[${clientId}] received message:`, reply);

      listenersRef.current.forEach((listener) => listener(reply));
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, clientId]);

  return (
    <ClientProvider
      connected={connected}
      initialState={initialState}
      onDisconnect={onDisconnect}
      onReconnect={onReconnect}
      send={send}
      subscribe={subscribe}
    >
      <Client
        clientId={clientId}
        onPersistedStateChange={onPersistedStateChange}
        onDelete={onDelete}
      />
    </ClientProvider>
  );
}

type ClientProps = {
  clientId: string;
  onPersistedStateChange: (
    clientId: string,
    state: PersistedClientState
  ) => void;
  onDelete: (clientId: string) => void;
};

const defaultCommandDataValue = JSON.stringify(
  { action: "", properties: {} },
  null,
  2
);

function Client({ clientId, onPersistedStateChange, onDelete }: ClientProps) {
  const {
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
    persistedState,
  } = useClientContext();
  const { connected } = state;

  const handlePersistedStateChange = useEventCallback(onPersistedStateChange);

  useEffect(() => {
    handlePersistedStateChange(clientId, persistedState);
  }, [handlePersistedStateChange, clientId, persistedState]);

  const { stateJson, commandsJson, persistedStateJson } = useMemo(
    () => ({
      stateJson: JSON.stringify(
        omit(state, ["commands", ...Object.keys(persistedState)]),
        null,
        2
      ),
      commandsJson: `[\n${state.commands
        .map((command) => `  ${JSON.stringify(command)}`)
        .join(",\n")}\n]`,
      persistedStateJson: JSON.stringify(
        omit(persistedState, "commands"),
        null,
        2
      ),
    }),
    [state, persistedState]
  );

  const pushBatchSizeRef = useRef<HTMLInputElement>(null);
  const commandDataRef = useRef<HTMLTextAreaElement>(null);

  return (
    <fieldset style={{ marginBottom: 20 }}>
      <legend
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          lineHeight: 1.5,
          padding: "0 8px",
        }}
      >
        <h2>{connected ? "📶" : "📵"}</h2>
        <h2>
          Client <code>{clientId}</code>
        </h2>
        <div>
          <button
            onClick={() => {
              onDisconnectClick();
              onDelete(clientId);
            }}
          >
            Delete
          </button>
        </div>
      </legend>
      <div style={{ display: "flex", flexDirection: "row", gap: 16 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
            minWidth: 300,
            maxWidth: "50%",
          }}
        >
          <div>
            <button
              disabled={nextDisabled}
              onClick={onNextClick}
              style={{ fontSize: 20, fontWeight: "bold" }}
            >
              {nextLabel}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
            <button onClick={onInterruptClick}>SIGINT</button>
            <button disabled={!connected} onClick={onDisconnectClick}>
              Disconnect
            </button>
            <button disabled={connected} onClick={onReconnectClick}>
              Reconnect
            </button>
          </div>
          <div style={{ width: "100%" }}>
            <h3>
              <label htmlFor="addCommandInput">Local Commands</label>
            </h3>
            <pre>{commandsJson}</pre>
            <div>
              <div>
                <textarea
                  ref={commandDataRef}
                  id="addCommandInput"
                  defaultValue={defaultCommandDataValue}
                  style={{ width: "100%", height: 100 }}
                />
              </div>
              <div>
                <button
                  onClick={() => {
                    const textarea = commandDataRef.current;
                    if (!textarea) return;

                    let data: CommandData | undefined = undefined;
                    try {
                      data = JSON.parse(textarea.value);
                    } catch {
                      // no-op
                    }

                    if (
                      !data ||
                      typeof data !== "object" ||
                      typeof data.action !== "string" ||
                      !data.properties ||
                      typeof data.properties !== "object"
                    ) {
                      textarea.value = defaultCommandDataValue;
                    } else {
                      textarea.value = JSON.stringify(data, null, 2);
                      addCommand(data);
                    }
                  }}
                >
                  Add Command
                </button>
              </div>
            </div>
            <div style={{ transform: "scale(75%)", marginTop: 10 }}>
              <label>
                {"Send "}
                <input
                  ref={pushBatchSizeRef}
                  type="number"
                  defaultValue={pushBatchSize}
                  onChange={(event) => {
                    const size = Number(event.target.value);
                    if (Number.isSafeInteger(size) && size > 0) {
                      setPushBatchSize(size);
                    }
                  }}
                  onBlur={() => {
                    if (pushBatchSizeRef.current) {
                      pushBatchSizeRef.current.value = String(pushBatchSize);
                    }
                  }}
                  style={{ width: 50, textAlign: "right" }}
                />
                {" commands at a time"}
              </label>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h3>Data stored on disk</h3>
          <pre>{persistedStateJson}</pre>
          <h3>In-memory state</h3>
          <pre>{stateJson}</pre>
        </div>
      </div>
    </fieldset>
  );
}
