# IDEAI Context File

## Project Overview

This directory contains the "tstlai" project, a TypeScript-based AI assistant interface library. The project provides a unified API for interacting with various AI providers like OpenAI, Anthropic, Google, etc.

### Key Information

- **Project Name**: tstlai
- **Primary Language**: TypeScript
- **Purpose**: A TypeScript library that provides a simple interface for interacting with various AI providers
- **License**: MIT License

### Project Structure

```
/home/stig/dev/ai/zaguan/labs/tstlai/
├── LICENSE (MIT License)
├── package.json (Project configuration and dependencies)
├── README.md (Project documentation)
├── tsconfig.json (TypeScript configuration)
├── IDEAI.md (This file)
├── .git/ (Version control)
├── dist/ (Compiled output)
├── docs/
│   └── initial-thoughts.md (Conceptual documentation)
├── examples/ (Usage examples)
│   ├── basic-example.ts
│   └── comprehensive-example.ts
├── src/ (Source code)
│   ├── index.ts (Main entry point)
│   ├── core/ (Core functionality)
│   │   └── TSTLAI.ts (Main TSTLAI class)
│   ├── types/ (TypeScript type definitions)
│   │   └── index.ts
│   ├── providers/ (AI provider implementations)
│   │   ├── BaseAIProvider.ts
│   │   └── OpenAIProvider.ts
│   └── utils/ (Utility functions)
└── test.ts (Simple test file)
```

## Core Components

### Main TSTLAI Class
The core of the library is the `TSTLAI` class located in `src/core/TSTLAI.ts`. This class provides:
- Conversation history management
- Provider initialization and management
- Message sending and response handling
- Configuration management

### Provider Abstraction
The library uses a provider abstraction pattern to support multiple AI services:
- `BaseAIProvider.ts` defines the abstract interface
- `OpenAIProvider.ts` provides a concrete implementation for OpenAI
- Easy to extend for other providers like Anthropic, Google, etc.

### Type Definitions
TypeScript types are defined in `src/types/index.ts` including:
- `ConversationMessage`: Structure for chat messages
- `AIProvider`: Interface for AI provider implementations
- `TSTLAIConfig`: Configuration options for the TSTLAI instance

## Building and Running

### Installation
```bash
npm install
```

### Building
```bash
npm run build
```
This compiles TypeScript files from `src/` to JavaScript in the `dist/` directory.

### Development
```bash
npm run dev
```
Watch mode for continuous compilation during development.

### Testing
```bash
npm test
```
Runs a simple test to verify functionality.

### Examples
```bash
# Run basic example
npm run example:basic

# Run comprehensive example
npm run example:comprehensive
```

## Development Conventions

1. **Language**: TypeScript is the primary language
2. **Architecture**: Modular design with clear separation of concerns
3. **Provider Pattern**: Abstract provider interface allows for easy extension to new AI services
4. **Type Safety**: Strong typing through TypeScript interfaces and types
5. **Conversation Management**: Built-in handling of conversation history
6. **Configuration**: Flexible configuration system for different providers and settings

## Key Features Implemented

1. **Core TSTLAI Class**: Main interface for AI interactions
2. **Provider Abstraction**: Common interface for different AI providers
3. **Conversation History**: Automatic management of message history
4. **Multiple Providers**: Support for different AI services (currently OpenAI implemented)
5. **Type Safety**: Full TypeScript typing for all components
6. **Examples**: Sample usage code demonstrating features

## Future Enhancement Opportunities

1. Add more provider implementations (Anthropic, Google, etc.)
2. Implement streaming responses
3. Add more sophisticated conversation management
4. Add middleware support for preprocessing/postprocessing
5. Implement caching mechanisms
6. Add rate limiting and retry logic

## Usage

The library is designed to be simple to use:

```typescript
import { TSTLAI } from 'tstlai';

// With placeholder provider
const ai = new TSTLAI({
  provider: {
    type: 'custom'
  }
});

// Send a message
ai.sendMessage('Hello, how are you?')
  .then(response => {
    console.log('AI Response:', response);
  });
```