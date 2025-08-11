# Miso70 Backend

Backend server for the Miso70 mobile app.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your API keys:
     - `OPENAI_API_KEY`: Your OpenAI API key
     - `MODELLAB_API_TOKEN`: Your ModelLab API token for image generation

3. Start the server:
```bash
npm start
```

## API Endpoints

- `POST /generate-dish` - Generate a dish based on preferences
- `POST /chat-dish-suggestion` - Generate dish suggestions for chat
- `POST /recipe-info` - Get detailed recipe information
- `POST /modify-recipe` - Modify existing recipes
- `POST /generate-image` - Generate dish images
- `POST /remix-dish` - Remix/transform dishes
- `POST /fuse-dish` - Legacy dish fusion endpoint

## Environment Variables

- `OPENAI_API_KEY`: Required for AI dish generation
- `MODELLAB_API_TOKEN`: Required for image generation
- `PORT`: Server port (default: 3001) 