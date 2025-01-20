export type Command = {
  id: string;
  action: string;
  properties: Record<string, unknown>;
  timestamp: string;
};

export type CommandData = Pick<
  Command,
  Exclude<keyof Command, "id" | "timestamp">
> &
  Partial<Pick<Command, "id" | "timestamp">>;

export type Doc = { id: string; type: string; updatedAt: string };

export type PushMessage = {
  topic: "PUSH";
  commands: Command[];
};

export type PushReply = {
  topic: "PUSH";
  processed: string[];
};

export type PullMessage = {
  topic: "PULL";
  locationId: string | null;
  cursor: string | null;
};

export type PullReply = {
  topic: "PULL";
  locationId: string;
  records: Doc[];
  nextCursor: string | null;
};
