# Project: CV Handler

## Project Overview

CV Handler is a web application designed to streamline the hiring process. It allows companies to manage job postings, upload candidate CVs, and automatically ranks candidates based on their suitability for a given role. The project is a single-page application (SPA) built with React, TypeScript, and Vite. It uses Tailwind CSS for styling and `shadcn/ui` for UI components. The backend is powered by Supabase for database and authentication, and it integrates with a separate Python-based LLM service for CV analysis and ranking.

## Building and Running

To get the project up and running, follow these steps:

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Set up environment variables:**
    Create a `.env` file in the root of the project and add your Supabase credentials:
    ```
    VITE_SUPABASE_URL=YOUR_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:8080`.

### Other available scripts:

*   **Build for production:**
    ```bash
    npm run build
    ```

*   **Build for development:**
    ```bash
    npm run build:dev
    ```

*   **Lint the code:**
    ```bash
    npm run lint
    ```

*   **Preview the production build:**
    ```bash
    npm run preview
    ```

## Development Conventions

*   **Code Style:** The project uses ESLint for code linting. The configuration can be found in `eslint.config.js`.
*   **Component Library:** The project uses `shadcn/ui` for its UI components. These components are located in `src/components/ui`.
*   **Routing:** Routing is handled by `react-router-dom`. The routes are defined in `src/App.tsx`.
*   **Data Fetching:** `react-query` is used for data fetching and caching.
*   **State Management:** For this application, state management is handled with a combination of `useState`, `useContext` and `react-query`.
*   **Path Aliases:** The project uses the `@` alias for the `src` directory. This is configured in `vite.config.ts` and `tsconfig.json`.
*   **Backend Integration:** The application communicates with a Supabase backend for data storage and authentication. The Supabase client is initialized in `src/integrations/supabase/client.ts`.
