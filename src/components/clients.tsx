import { useCallback, useState } from "react";
import { v4 as uuid } from "uuid";

import {
  initialPersistedState,
  PersistedClientState,
} from "../contexts/client_context/state";
import { ClientContainer } from "./client";
import { useValueRef } from "../utils/hooks";

type ClientStorageItem = {
  clientId: string;
  username: string;
  password: string;
  initialState: PersistedClientState;
};

type LocalStorageValue = {
  username: string;
  password: string;
  state: PersistedClientState;
};

export function Clients() {
  const [clients, setClients] = useState<ClientStorageItem[]>(() => {
    const clients: ClientStorageItem[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const match = key.match(
        /^clientDb:([\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})$/
      );

      if (!match) continue;

      const [, clientId] = match;

      let result: LocalStorageValue | null = null;

      try {
        result = JSON.parse(localStorage.getItem(key)!);
      } catch {
        continue;
      }

      if (
        result !== null &&
        typeof result === "object" &&
        typeof result.username === "string" &&
        typeof result.password === "string" &&
        result.state !== null &&
        typeof result.state === "object" &&
        (result.state.cursor === null ||
          typeof result.state.cursor === "string") &&
        Array.isArray(result.state.commands) &&
        Array.isArray(result.state.records)
      ) {
        const { username, password, state: initialState } = result;
        clients.push({ clientId, username, password, initialState });
      }
    }

    return clients;
  });

  const addClient = (): void => {
    let username: string;
    do {
      username = prompt("Username") ?? "";
    } while (!username);
    const password = prompt("Password (optional)") ?? "password";

    setClients((clients) => [
      ...clients,
      {
        clientId: uuid(),
        username,
        password,
        initialState: initialPersistedState,
      },
    ]);
  };

  const onDelete = useCallback((clientId: string): void => {
    localStorage.removeItem(`clientDb:${clientId}`);
    setClients((clients) =>
      clients.filter((client) => client.clientId !== clientId)
    );
  }, []);

  const clientsRef = useValueRef(clients);

  const onPersistedStateChange = useCallback(
    (clientId: string, state: PersistedClientState): void => {
      const clients = clientsRef.current;
      const client = clients.find((client) => client.clientId === clientId)!;
      const value: LocalStorageValue = { ...client, state };
      localStorage.setItem(`clientDb:${clientId}`, JSON.stringify(value));
    },
    [clientsRef]
  );

  return (
    <div>
      <div>
        <button onClick={addClient}>Add client</button>
      </div>
      <hr />
      <div>
        {clients.map(({ clientId, username, password, initialState }) => (
          <ClientContainer
            key={clientId}
            clientId={clientId}
            username={username}
            password={password}
            initialState={initialState}
            onPersistedStateChange={onPersistedStateChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
