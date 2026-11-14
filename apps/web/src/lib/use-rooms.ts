import type { RoomCreate, RoomPatch, RoomPhotoIndex } from "@hearth/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRoom,
  deleteRoom,
  deleteRoomPhoto,
  fetchMyRooms,
  fetchRoom,
  fetchRooms,
  updateRoom,
  uploadRoomPhotos,
} from "@/lib/rooms";

/** All room mutations invalidate the whole ["rooms"] key space so the
 * browse list, "mine", and any open details view refetch together. */
function useRoomsInvalidatingMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
}

export function useRooms(enabled = true) {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: fetchRooms,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useMyRooms(enabled = true) {
  return useQuery({
    queryKey: ["rooms", "mine"],
    queryFn: fetchMyRooms,
    enabled,
    retry: false,
  });
}

export function useRoom(roomId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rooms", roomId],
    queryFn: () => fetchRoom(roomId ?? ""),
    enabled: enabled && roomId !== null,
    retry: false,
  });
}

export function useCreateRoom() {
  return useRoomsInvalidatingMutation((body: RoomCreate) => createRoom(body));
}

export function useUpdateRoom() {
  return useRoomsInvalidatingMutation((input: { roomId: string; patch: RoomPatch }) =>
    updateRoom(input.roomId, input.patch),
  );
}

export function useDeleteRoom() {
  return useRoomsInvalidatingMutation((roomId: string) => deleteRoom(roomId));
}

export function useUploadRoomPhotos() {
  return useRoomsInvalidatingMutation((input: { roomId: string; photos: File[] }) =>
    uploadRoomPhotos(input.roomId, input.photos),
  );
}

export function useDeleteRoomPhoto() {
  return useRoomsInvalidatingMutation((input: { roomId: string; index: RoomPhotoIndex }) =>
    deleteRoomPhoto(input.roomId, input.index),
  );
}
