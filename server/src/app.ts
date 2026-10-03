import { defineRoom, defineServer } from 'colyseus';
import { ROOM_NAME } from '@museum/shared';
import { PartyRoom } from './rooms/PartyRoom.js';
import { mountRoutes } from './http/routes.js';

export function createServer() {
  return defineServer({
    rooms: {
      // Parties are found by slug: opening /party/<slug> joins that exact room or
      // recreates it under the same slug if it no longer exists.
      [ROOM_NAME]: defineRoom(PartyRoom).filterBy(['slug']),
    },
    greet: false,
    express: (app) => mountRoutes(app, process.env.CLIENT_ORIGIN),
  });
}
