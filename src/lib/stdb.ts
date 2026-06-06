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

export function subscribeToSession(conn: DbConnection, sessionId: bigint) {
  return conn.subscriptionBuilder().subscribe([
    tables.session.where(r => r.sessionId.eq(sessionId)),
    tables.character.where(r => r.sessionId.eq(sessionId)),
    tables.scene.where(r => r.sessionId.eq(sessionId)),
    tables.panel.where(r => r.sessionId.eq(sessionId)),
    tables.narrativeDirective.where(r => r.sessionId.eq(sessionId)),
    tables.memory.where(r => r.sessionId.eq(sessionId)),
  ]);
}

export function subscribeToAllSessions(conn: DbConnection) {
  return conn.subscriptionBuilder().subscribe([
    tables.session,
    tables.character,
    tables.scene,
    tables.panel,
  ]);
}
