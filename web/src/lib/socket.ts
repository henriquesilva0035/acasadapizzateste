// web/src/lib/socket.ts
import { io } from "socket.io-client";
import { API_URL } from "./api";

// conecta no mesmo host/porta do backend
export const socket = io(API_URL, {
  transports: ["websocket"],
});
