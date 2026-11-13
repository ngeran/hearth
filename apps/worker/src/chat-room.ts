export class ChatRoom implements DurableObject {
  async fetch(): Promise<Response> {
    return Response.json(
      {
        error: {
          code: "not_implemented",
          message: "Chat is delivered in milestone 4.",
        },
      },
      { status: 501 },
    );
  }
}
