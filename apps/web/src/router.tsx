import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { HomeRoute } from "@/routes/home-route";
import { MatchesRoute } from "@/routes/matches-route";
import { MessagesRoute } from "@/routes/messages-route";
import { NotFoundRoute } from "@/routes/not-found-route";
import { OnboardingRoute } from "@/routes/onboarding-route";
import { ProfileRoute } from "@/routes/profile-route";
import { RoomEditRoute } from "@/routes/room-edit-route";
import { RoomsRoute } from "@/routes/rooms-route";
import { SignInRoute } from "@/routes/sign-in-route";

export const router = createBrowserRouter([
  {
    path: "/sign-in",
    element: <SignInRoute />,
  },
  {
    path: "/onboarding",
    element: (
      <RequireAuth>
        <OnboardingRoute />
      </RequireAuth>
    ),
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomeRoute />,
      },
      {
        path: "matches",
        element: (
          <RequireAuth>
            <MatchesRoute />
          </RequireAuth>
        ),
      },
      {
        path: "messages",
        element: (
          <RequireAuth>
            <MessagesRoute />
          </RequireAuth>
        ),
      },
      {
        path: "rooms",
        element: (
          <RequireAuth>
            <RoomsRoute />
          </RequireAuth>
        ),
      },
      {
        path: "rooms/edit",
        element: (
          <RequireAuth>
            <RoomEditRoute />
          </RequireAuth>
        ),
      },
      {
        path: "profile",
        element: (
          <RequireAuth>
            <ProfileRoute />
          </RequireAuth>
        ),
      },
      {
        path: "*",
        element: <NotFoundRoute />,
      },
    ],
  },
]);
