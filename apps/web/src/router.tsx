import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { PlaceholderPage } from "@/components/placeholder-page";
import { RequireAuth } from "@/components/require-auth";
import { HomeRoute } from "@/routes/home-route";
import { NotFoundRoute } from "@/routes/not-found-route";
import { OnboardingRoute } from "@/routes/onboarding-route";
import { ProfileRoute } from "@/routes/profile-route";
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
        element: <PlaceholderPage kind="matches" />,
      },
      {
        path: "messages",
        element: <PlaceholderPage kind="messages" />,
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
