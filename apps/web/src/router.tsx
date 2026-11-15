import { createBrowserRouter } from "react-router-dom";

import { AdminShell } from "@/components/admin-shell";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { AdminErrorsRoute } from "@/routes/admin-errors-route";
import { AdminOverviewRoute } from "@/routes/admin-overview-route";
import { AdminRoomsRoute } from "@/routes/admin-rooms-route";
import { AdminUserDetailRoute } from "@/routes/admin-user-detail-route";
import { AdminUsersRoute } from "@/routes/admin-users-route";
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
    path: "/admin",
    element: (
      <RequireAuth>
        <AdminShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <AdminOverviewRoute /> },
      { path: "users", element: <AdminUsersRoute /> },
      { path: "users/:id", element: <AdminUserDetailRoute /> },
      { path: "errors", element: <AdminErrorsRoute /> },
      { path: "rooms", element: <AdminRoomsRoute /> },
      { path: "*", element: <NotFoundRoute /> },
    ],
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
