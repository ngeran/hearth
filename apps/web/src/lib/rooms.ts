import {
  type MyRoomsResponse,
  myRoomsResponseSchema,
  type RoomCreate,
  type RoomDetails,
  type RoomPatch,
  type RoomPhotoIndex,
  type RoomsResponse,
  roomDetailsSchema,
  roomsResponseSchema,
} from "@hearth/shared";

import { readError, requestJson } from "@/lib/me";

/** Room photos are served by an authenticated worker route; the updatedAt
 * query parameter busts the cache when the photo set changes. */
export function roomPhotoUrl(roomId: string, index: RoomPhotoIndex, version: number): string {
  return `/api/v1/rooms/${encodeURIComponent(roomId)}/photos/${index}?v=${version}`;
}

export async function fetchRooms(): Promise<RoomsResponse> {
  const response = await fetch("/api/v1/rooms", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, roomsResponseSchema);
}

export async function fetchRoom(roomId: string): Promise<RoomDetails> {
  const response = await fetch(`/api/v1/rooms/${encodeURIComponent(roomId)}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, roomDetailsSchema);
}

export async function fetchMyRooms(): Promise<MyRoomsResponse> {
  const response = await fetch("/api/v1/rooms/mine", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, myRoomsResponseSchema);
}

export async function createRoom(body: RoomCreate): Promise<RoomDetails> {
  const response = await fetch("/api/v1/rooms", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  return requestJson(response, roomDetailsSchema);
}

export async function updateRoom(roomId: string, patch: RoomPatch): Promise<RoomDetails> {
  const response = await fetch(`/api/v1/rooms/${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(patch),
  });

  return requestJson(response, roomDetailsSchema);
}

export async function deleteRoom(roomId: string): Promise<void> {
  const response = await fetch(`/api/v1/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw await readError(response);
  }
}

export async function uploadRoomPhotos(roomId: string, photos: File[]): Promise<RoomDetails> {
  const form = new FormData();
  for (const photo of photos) {
    form.append("photos", photo);
  }

  const response = await fetch(`/api/v1/rooms/${encodeURIComponent(roomId)}/photos`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });

  return requestJson(response, roomDetailsSchema);
}

export async function deleteRoomPhoto(roomId: string, index: RoomPhotoIndex): Promise<RoomDetails> {
  const response = await fetch(`/api/v1/rooms/${encodeURIComponent(roomId)}/photos/${index}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, roomDetailsSchema);
}
