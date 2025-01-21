import { v4 as uuid } from "uuid";

import { Command, CommandData, Doc } from "../../types";

type ClientBaseState = {
  connected: boolean;
  commands: Command[];
  totalCommandsSent: number;
  cursor: string | null;
  records: Record<string, Doc>;
  totalDocsReceived: number;
  lastAction: ClientAction | null;
  nextActionType: NextActionType;
  activeLocationId: string | null;
};

export type NextActionType = Exclude<
  ClientAction["type"],
  "command" | "connectionChanged" | "interrupted"
>;

type ClientPushingState = {
  topic: "PUSH";
  step: "fetchingCommands";
  batchNumber: number;
};

export type ClientPushedState = {
  topic: "PUSH";
  step: "awaitingAck" | "deletingCommands";
  lastBatch: Command[];
  batchNumber: number;
};

type ClientPullingState = {
  topic: "PULL";
  step: "sendingPull" | "awaitingBatch";
  batchNumber: number;
  lastBatch: Record<string, Doc> | undefined;
  nextCursor: string | null | undefined;
};

type ClientPulledState = {
  topic: "PULL";
  step: "upsertingBatch";
  batchNumber: number;
  lastBatch: Record<string, Doc>;
  nextCursor: string | null;
};

type ClientIdleState = {
  topic: "IDLE";
};

export type ClientState = ClientBaseState &
  (
    | ClientPushingState
    | ClientPushedState
    | ClientPullingState
    | ClientPulledState
    | ClientIdleState
  );

export type PersistedClientState = {
  commands: Command[];
  cursor: string | null;
  records: Doc[];
  activeLocationId: string | null;
};

export const initialPersistedState: PersistedClientState = {
  commands: [],
  cursor: null,
  records: [],
  activeLocationId: null,
};

export function initializeState({
  records,
  connected = true,
  ...state
}: PersistedClientState & { connected?: boolean }): ClientState {
  return {
    ...state,
    connected,
    totalCommandsSent: 0,
    records: recordsById(records),
    totalDocsReceived: 0,
    topic: "PUSH",
    step: "fetchingCommands",
    batchNumber: 0,
    lastAction: null,
    nextActionType: state.commands.length > 0 ? "sentCommandBatch" : "sentPull",
  };
}

function recordsById(records: Doc[]): Record<string, Doc> {
  return records.reduce<Record<string, Doc>>((acc, record) => {
    let key: string;
    switch (record.type) {
      case "category":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        key = `category:${(record as any).categoryTableId}:${record.id}`;
        break;
      default:
        key = `${record.type}:${record.id}`;
        break;
    }

    acc[key] = record;
    return acc;
  }, {});
}

export function persistedState({
  commands,
  cursor,
  records,
  activeLocationId,
}: RequiredKeys<
  ClientState,
  "commands" | "cursor" | "records" | "activeLocationId"
>): PersistedClientState {
  return {
    commands,
    cursor,
    records: Object.values(records),
    activeLocationId,
  };
}

type ClientSentCommandBatchAction = {
  topic: "PUSH";
  type: "sentCommandBatch";
  limit: number;
};

type ClientCommandsAckedAction = {
  topic: "PUSH";
  type: "commandsAcked";
};

type ClientDeletedCommandsAction = {
  topic: "PUSH";
  type: "deletedCommands";
};

type ClientSentPullAction = {
  topic: "PULL";
  type: "sentPull";
};

type ClientPullReceivedAction = {
  topic: "PULL";
  type: "pullReceived";
  locationId: string;
  records: Doc[];
  nextCursor: string | null;
};

type ClientUpsertedBatchAction = {
  topic: "PULL";
  type: "upsertedBatch";
};

type ClientConnectionChangedAction = {
  type: "connectionChanged";
  connected: boolean;
};

type ClientInterruptedAction = {
  type: "interrupted";
};

type ClientCommandAction = {
  type: "command";
  command: CommandData;
};

export type ClientAction =
  | ClientSentCommandBatchAction
  | ClientCommandsAckedAction
  | ClientDeletedCommandsAction
  | ClientSentPullAction
  | ClientPullReceivedAction
  | ClientUpsertedBatchAction
  | ClientConnectionChangedAction
  | ClientInterruptedAction
  | ClientCommandAction;

const nextActionLabels: Record<NextActionType, string> = {
  sentCommandBatch: "Send next PUSH",
  commandsAcked: "Receive PUSH ack",
  deletedCommands: "Delete local commands",
  sentPull: "Send next PULL",
  pullReceived: "Receive PULL",
  upsertedBatch: "Upsert documents/cursor",
};

export function nextActionLabel({
  nextActionType,
}: RequiredKeys<ClientState, "nextActionType">): string {
  return nextActionLabels[nextActionType];
}

export function reducer(
  {
    connected,
    commands,
    totalCommandsSent,
    cursor,
    records,
    totalDocsReceived,
    nextActionType,
    activeLocationId,
    ...state
  }: ClientState,
  action: ClientAction
): ClientState {
  const base: Omit<ClientBaseState, "nextActionType"> = {
    connected,
    commands,
    totalCommandsSent,
    cursor,
    records,
    totalDocsReceived,
    activeLocationId,
    lastAction: action,
  };

  switch (action.type) {
    case "sentCommandBatch": {
      const batchNumber = (state.topic === "PUSH" ? state.batchNumber : 0) + 1;
      const lastBatch = commands.slice(0, action.limit);
      base.totalCommandsSent += lastBatch.length;

      return {
        topic: "PUSH",
        step: "awaitingAck",
        lastBatch,
        batchNumber,
        nextActionType: "commandsAcked",
        ...base,
      };
    }

    case "commandsAcked": {
      const { lastBatch, batchNumber } = state as ClientPushedState;

      return {
        topic: "PUSH",
        step: "deletingCommands",
        lastBatch,
        batchNumber,
        nextActionType: "deletedCommands",
        ...base,
      };
    }

    case "deletedCommands": {
      const { lastBatch, batchNumber } = state as ClientPushedState;
      base.commands = base.commands.slice(lastBatch.length);

      return {
        topic: "PUSH",
        step: "fetchingCommands",
        batchNumber,
        nextActionType:
          base.commands.length > 0 ? "sentCommandBatch" : "sentPull",
        ...base,
      };
    }

    case "sentPull": {
      const batchNumber = (state.topic === "PULL" ? state.batchNumber : 0) + 1;
      const { lastBatch, nextCursor } =
        state.topic === "PULL"
          ? state
          : { lastBatch: undefined, nextCursor: undefined };

      return {
        topic: "PULL",
        step: "awaitingBatch",
        batchNumber,
        lastBatch,
        nextCursor,
        nextActionType: "pullReceived",
        ...base,
      };
    }

    case "pullReceived": {
      base.totalDocsReceived += action.records.length;
      const { batchNumber } = state as ClientPullingState;
      const lastBatch = recordsById(action.records);

      return {
        topic: "PULL",
        step: "upsertingBatch",
        batchNumber,
        lastBatch,
        nextCursor: action.nextCursor,
        nextActionType: "upsertedBatch",
        ...base,
      };
    }

    case "upsertedBatch": {
      const { batchNumber, lastBatch, nextCursor } = state as ClientPulledState;
      const lastAction = state.lastAction! as ClientPullReceivedAction;
      base.cursor = nextCursor;
      base.records = { ...base.records, ...lastBatch };
      base.activeLocationId = lastAction.locationId;

      if (Object.keys(lastBatch).length > 0) {
        return {
          topic: "PULL",
          step: "sendingPull",
          batchNumber,
          lastBatch,
          nextCursor,
          nextActionType: "sentPull",
          ...base,
        };
      } else {
        return {
          topic: "IDLE",
          nextActionType: commands.length > 0 ? "sentCommandBatch" : "sentPull",
          ...base,
        };
      }
    }

    case "connectionChanged": {
      if (base.connected === action.connected) {
        return { ...base, ...state, nextActionType };
      }

      base.connected = action.connected;

      if (action.connected) {
        return {
          topic: "PUSH",
          step: "fetchingCommands",
          batchNumber: 0,
          nextActionType: commands.length > 0 ? "sentCommandBatch" : "sentPull",
          ...base,
        };
      } else {
        return {
          topic: "IDLE",
          nextActionType: commands.length > 0 ? "sentCommandBatch" : "sentPull",
          ...base,
        };
      }
    }

    case "interrupted": {
      return initializeState({
        ...persistedState({ ...base, ...state }),
        connected: false,
      });
    }

    case "command": {
      const {
        timestamp = new Date().toISOString(),
        id = uuid(),
        ...data
      } = action.command;
      const command: Command = { timestamp, id, ...data };

      base.commands = [...base.commands, command];

      return {
        ...base,
        ...state,
        nextActionType:
          state.topic === "IDLE" ? "sentCommandBatch" : nextActionType,
      };
    }
  }
}

type RequiredKeys<T extends Record<string, unknown>, K extends keyof T> = {
  [k in Exclude<keyof T, K>]?: T[k] | undefined;
} & {
  [k in K]-?: T[k];
};
