# Recipe Manager Application

## Overview

This is a full-stack recipe management application built with React, Express.js, and Firebase. The app allows users to create, manage, and organize recipes, plan meals, and generate shopping lists. It features a clean, modern UI built with shadcn/ui components and Tailwind CSS.

## System Architecture

The application follows a modern full-stack architecture with a clear separation between frontend and backend:

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: TanStack Query (React Query) for server state
- **Form Handling**: React Hook Form with Zod validation
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **Database**: Firebase Firestore (NoSQL document database)
- **Schema Validation**: Zod for runtime type checking
- **Web Scraping**: Cheerio and Axios for recipe extraction from URLs

## Key Components

### Database Layer
- **Firebase Firestore**: Primary database storing recipes, meal plans, and shopping lists
- **Collections**: 
  - `recipes`: Recipe documents with ingredients, instructions, metadata
  - `mealPlans`: Daily meal planning entries linked to recipes
  - `shoppingList`: Shopping list items with completion status
- **Storage Interface**: Abstract `IStorage` interface with `FirebaseStorage` implementation

### API Layer
- **RESTful Design**: Express.js routes handling CRUD operations
- **Recipe Management**: Create, read, update, delete, and search recipes
- **Meal Planning**: Weekly meal planning with date-based organization
- **Shopping Lists**: Generate shopping lists from meal plans, mark items complete
- **Recipe Scraping**: Extract recipe data from external URLs using structured data

### Frontend Components
- **Recipe Cards**: Display recipe summaries with actions (favorite, add to meal plan)
- **Recipe Detail Modal**: Full recipe view with ingredients and instructions
- **Add Recipe Modal**: Form for manual recipe entry or URL import
- **Meal Planning**: Weekly calendar view for planning meals
- **Shopping List**: Categorized shopping list with completion tracking

### Data Flow
1. **Recipe Creation**: Users can manually enter recipes or import from URLs
2. **Meal Planning**: Users assign recipes to specific dates and meal types
3. **Shopping List Generation**: System extracts ingredients from planned meals
4. **State Synchronization**: TanStack Query manages cache invalidation and updates

## External Dependencies

### Core Dependencies
- **Firebase Admin SDK**: Server-side Firebase integration
- **@neondatabase/serverless**: Database connection (configured for PostgreSQL but currently using Firebase)
- **Drizzle ORM**: SQL query builder (configured but not actively used with Firebase)
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form state management and validation
- **Zod**: Schema validation for both client and server

### UI Dependencies
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **shadcn/ui**: Pre-built component library

### Development Dependencies
- **Vite**: Build tool and development server
- **TypeScript**: Type checking and compilation
- **ESBuild**: Fast JavaScript bundler for production

## Deployment Strategy

### Development Environment
- **Hot Reload**: Vite development server with HMR
- **Type Checking**: TypeScript compilation and checking
- **Database**: Firebase emulator or cloud instance

### Production Build
- **Frontend**: Vite builds optimized static assets
- **Backend**: ESBuild bundles server code for Node.js
- **Static Serving**: Express serves built frontend assets
- **Database**: Firebase Firestore cloud instance

### Environment Configuration
- **Firebase**: Configured via environment variables or emulator
- **Database URL**: PostgreSQL connection string (prepared for future migration)
- **Build Scripts**: Separate development and production workflows

## User Preferences

Preferred communication style: Simple, everyday language.

## Changelog

Changelog:
- June 30, 2025: Initial setup
- June 30, 2025: Migrated from Firebase to PostgreSQL with full user authentication
- June 30, 2025: Enhanced ingredient system with quantity/units and optional sections

## Recent Changes

### Firebase Authentication Migration (June 30, 2025)
- Migrated from Replit Auth/PostgreSQL to Firebase Authentication
- Updated to email/password authentication instead of Google OAuth
- Added automatic user creation in database when users authenticate
- Fixed authentication token handling for all API requests
- Updated landing page with email/password sign in/up forms

### Ingredient System Enhancement (June 30, 2025)
- Updated database schema to support structured ingredients with quantity and units
- Added ingredient sections functionality for complex recipes (e.g., "Cake" and "Frosting" sections)
- Modified Add Recipe Modal to support new ingredient structure with section names
- Updated storage layer and scraper service to handle new ingredient format

### Drag-and-Drop Enhancement (June 30, 2025)
- Implemented comprehensive drag-and-drop functionality using react-beautiful-dnd
- Added draggable ingredient sections with visual feedback during drag operations
- Enabled ingredient reordering within sections and moving between different sections
- Auto-focus functionality on new section name fields for improved user experience
- Fixed Edit Recipe Modal save button functionality and structural issues
- Enhanced UX with grip handles, blue highlighting during drag, and prominent X close button