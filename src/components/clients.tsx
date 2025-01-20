import React, { useCallback, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import {
  initialPersistedState,
  PersistedClientState,
} from "../contexts/client_context/state";
import { ClientContainer } from "./client";

type ClientStorageItem = {
  clientId: string;
  initialState: PersistedClientState;
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

      let initialState: PersistedClientState | null = null;
      try {
        initialState = JSON.parse(localStorage.getItem(key)!);
      } catch {
        continue;
      }

      if (
        initialState !== null &&
        typeof initialState === "object" &&
        (initialState.cursor === null ||
          typeof initialState.cursor === "string") &&
        Array.isArray(initialState.commands) &&
        Array.isArray(initialState.records)
      ) {
        clients.push({ clientId, initialState });
      }
    }

    return clients;
  });

  const addClient = (): void => {
    setClients((clients) => [
      ...clients,
      { clientId: uuid(), initialState: initialPersistedState },
    ]);
  };

  const onDelete = useCallback((clientId: string): void => {
    localStorage.removeItem(`clientDb:${clientId}`);
    setClients((clients) =>
      clients.filter((client) => client.clientId !== clientId)
    );
  }, []);

  const onPersistedStateChange = useCallback(
    (clientId: string, state: PersistedClientState): void => {
      localStorage.setItem(`clientDb:${clientId}`, JSON.stringify(state));
    },
    []
  );

  const clientSelectRef = useRef<HTMLSelectElement>(null);

  return (
    <div>
      <div>
        <button onClick={addClient}>Add client</button>
      </div>
      <hr />
      <div>
        {clients.map(({ clientId, initialState }) => (
          <ClientContainer
            key={clientId}
            clientId={clientId}
            initialState={initialState}
            onPersistedStateChange={onPersistedStateChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
