import {
  DbConnection,
  ErrorContext,
  tables,
} from '../module_bindings';

const HOST =
  import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3001';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'inkwell';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

export { HOST, DB_NAME, TOKEN_KEY };

export const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect((_conn, identity, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    console.log('Connected to SpacetimeDB:', identity.toHexString());
  })
  .onDisconnect(() => {
    console.log('Disconnected from SpacetimeDB');
  })
  .onConnectError((_ctx: ErrorContext, err: Error) => {
    console.error('SpacetimeDB connection error:', err);
  });

/** @deprecated Subscriptions are managed automatically by useTable hooks. */
export function subscribeToSession(_conn: DbConnection, _sessionId: bigint) {
  /* no-op — useTable handles subscriptions */
}

/** @deprecated Subscriptions are managed automatically by useTable hooks. */
export function subscribeToAllSessions(_conn: DbConnection) {
  /* no-op — useTable handles subscriptions */
}

export { tables };
