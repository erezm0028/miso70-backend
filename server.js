const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

// ModelLab API configuration (fallback)
const MODELLAB_API_URL = 'https://modelslab.com/api/v6/images/text2img';
const MODELLAB_API_TOKEN = process.env.MODELLAB_API_TOKEN;

// Debug: Check if API tokens are loaded
console.log('MODELLAB_API_TOKEN loaded:', MODELLAB_API_TOKEN ? 'YES' : 'NO');
console.log('MODELLAB_API_TOKEN length:', MODELLAB_API_TOKEN ? MODELLAB_API_TOKEN.length : 0);
if (!MODELLAB_API_TOKEN) {
  console.warn('WARNING: MODELLAB_API_TOKEN is not set - ModelLab fallback will not work');
}

const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint for Railway
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Miso70 Backend is running!',
    timestamp: new Date().toISOString()
  });
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// 1. Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { messages, currentDish } = req.body; // [{role: 'user', content: '...'}, ...]
    
    // Add context about the current dish if available
    let systemMessage = "You are a helpful cooking assistant. Focus on recipes, ingredients, cooking techniques, and food-related topics. Keep responses concise and practical.";
    
    if (currentDish) {
      systemMessage += `\n\nCurrent dish context: ${currentDish.title} - ${currentDish.description}`;
      systemMessage += `\n\nCRITICAL INSTRUCTIONS FOR CURRENT DISH CONTEXT:`;
      systemMessage += `\n- If the user asks to modify this current dish (e.g., 'make this 0 carbs', 'make it vegan', 'add cheese', 'less spicy', 'use my eggplants', 'add to this dish'), DO NOT suggest a new dish.`;
      systemMessage += `\n- Instead, acknowledge that you can modify the current ${currentDish.title} recipe and ask if they want you to apply the changes.`;
      systemMessage += `\n- DO NOT suggest alternative dishes or new recipes when the user wants to modify the current dish.`;
      systemMessage += `\n- Only suggest new dishes when the user explicitly asks for a new recipe or dish idea.`;
      systemMessage += `\n- For modifications, respond with: "I can modify your current ${currentDish.title} based on your request. This will update the recipe. Would you like me to apply this change?"`;
    }
    
    const enhancedMessages = [
      { role: 'system', content: systemMessage },
      ...messages
    ];
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Use 'gpt-4' if you have access
      messages: enhancedMessages,
      max_tokens: 300, // Limit response length for better UX
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Dish generation endpoint
app.post('/generate-dish', async (req, res) => {
  try {
    console.log('Backend received request body:', JSON.stringify(req.body, null, 2));
    const { dish, preferences } = req.body;
    console.log('Backend extracted dish:', dish);
    console.log('Backend extracted preferences:', JSON.stringify(preferences, null, 2));
    
    // If dish context is provided, use it to generate a dish that MUST include those ingredients
    if (dish && dish.trim()) {
      console.log('Using dish context to generate dish with required ingredients:', dish);
      const prompt = `Generate a creative, unique dish that MUST include these ingredients: ${dish}.

IMPORTANT REQUIREMENTS:
- The dish MUST include ${dish} as a main ingredient
- Be creative and innovative with how you use ${dish}
- The dish should be flavorful and appealing
- Consider different cooking methods and flavor combinations

Respond in this format:
Dish Name: <name>
Description: <Single sentence only. What is it + 2-3 main ingredients. No marketing language.>
Main Ingredients: <comma-separated list>`;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });
      return res.json({ dish: response.choices[0].message.content });
    }

    // Handle the case where preferences might be empty or random
    console.log('Checking preferences validity:', preferences);
    if (!preferences || (preferences.random && preferences.random === true)) {
      const prompt = `Generate a creative, unique dish with no specific restrictions.
Respond in this format:
Dish Name: <name>
Description: <Single sentence only. What is it + 2-3 main ingredients. No marketing language.>
Main Ingredients: <comma-separated list>`;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });
      return res.json({ dish: response.choices[0].message.content });
    }

    // Build a detailed prompt based on the preferences structure
    let prompt = 'Generate a creative, unique dish that MUST follow these requirements:\n\n';
    
    // Add dietary restrictions with specific guidance
    if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
      prompt += `DIETARY REQUIREMENTS: The dish must be ${preferences.dietaryRestrictions.join(', ').toLowerCase()}.\n`;
      
      // Add specific guidance for common dietary restrictions
      if (preferences.dietaryRestrictions.includes('Low Carb')) {
        prompt += `- Low Carb: Avoid pasta, rice, bread, potatoes, and high-carb vegetables. Use cauliflower, zucchini, or other low-carb alternatives.\n`;
      }
      if (preferences.dietaryRestrictions.includes('Low Fat')) {
        prompt += `- Low Fat: Use lean proteins, minimal oil, and avoid heavy creams, butter, and fatty meats.\n`;
      }
      if (preferences.dietaryRestrictions.includes('Vegan')) {
        prompt += `- Vegan: No animal products including meat, dairy, eggs, or honey.\n`;
      }
      if (preferences.dietaryRestrictions.includes('Vegetarian')) {
        prompt += `- Vegetarian: No meat, but can include dairy and eggs.\n`;
      }
      if (preferences.dietaryRestrictions.includes('Gluten-Free')) {
        prompt += `- Gluten-Free: No wheat, barley, rye, or gluten-containing ingredients.\n`;
      }
    }
    
    // Add cuisine preferences
    if (preferences.cuisines && preferences.cuisines.length > 0) {
      if (preferences.cuisines.length === 1) {
        prompt += `CUISINE: The dish should be inspired by ${preferences.cuisines[0]} cuisine.\n`;
      } else {
        prompt += `CUISINE: The dish should be a fusion of ${preferences.cuisines.join(' and ')} cuisines.\n`;
      }
    }
    
    // Add specific classic dishes
    if (preferences.classicDishes && preferences.classicDishes.length > 0) {
      prompt += `SPECIFIC DISHES: The dish should incorporate elements from or be inspired by: ${preferences.classicDishes.join(', ')}.\n`;
    }
    
    // Add plate style preferences
    if (preferences.plateStyles && preferences.plateStyles.length > 0) {
      prompt += `PLATE STYLE: The dish should be served as a ${preferences.plateStyles[0].toLowerCase()}.\n`;
      
      // Add specific guidance for plate styles
      if (preferences.plateStyles.includes('Salad Bowl')) {
        prompt += `- Salad Bowl: Create a dish that can be served in a bowl with mixed ingredients, greens, and a light dressing.\n`;
      }
      if (preferences.plateStyles.includes('Comfort Plate')) {
        prompt += `- Comfort Plate: Create a hearty, warm dish that's satisfying and filling.\n`;
      }
      if (preferences.plateStyles.includes('Stir Fry Plate')) {
        prompt += `- Stir Fry Plate: Create a dish that can be quickly cooked in a wok with vegetables and protein.\n`;
      }
      if (preferences.plateStyles.includes('Bento Box')) {
        prompt += `- Bento Box: Create a dish that can be portioned into separate compartments with rice, protein, and vegetables.\n`;
      }
      if (preferences.plateStyles.includes('Wrap')) {
        prompt += `- Wrap: Create a dish that can be wrapped in a tortilla, flatbread, or lettuce.\n`;
      }
      if (preferences.plateStyles.includes('Soup / Stew')) {
        prompt += `- Soup / Stew: Create a liquid-based dish that can be served in a bowl.\n`;
      }
      if (preferences.plateStyles.includes('Sandwich / Toast')) {
        prompt += `- Sandwich / Toast: Create a dish that can be served between bread or on toast.\n`;
      }
      if (preferences.plateStyles.includes('Finger Food')) {
        prompt += `- Finger Food: Create a dish that can be eaten with hands, like skewers, small bites, or appetizers.\n`;
      }
    }
    
    // Add ingredient preferences (ingredients to avoid)
    if (preferences.ingredientPreferences && preferences.ingredientPreferences.length > 0) {
      prompt += `INGREDIENT PREFERENCES: The dish must NOT include these ingredients: ${preferences.ingredientPreferences.join(', ')}.\n`;
    }
    
    // Add specific dish request if provided
    if (preferences.specificDish) {
      prompt += `SPECIFIC DISH REQUEST: The user specifically wants a dish called "${preferences.specificDish}". Create a variation or interpretation of this dish that respects all the other preferences above.\n`;
      if (preferences.chatContext) {
        prompt += `CONTEXT: ${preferences.chatContext}\n`;
      }
    }
    
    prompt += `\nIMPORTANT: 
- The dish MUST respect all dietary restrictions listed above
- The dish MUST incorporate the specified cuisine(s) and/or classic dishes
- The dish MUST be served in the specified plate style
- The dish MUST NOT include any of the avoided ingredients
- If a specific dish is requested, create a variation that fits all preferences
- Be creative but stay true to the requirements
- Do not include ingredients that violate the dietary restrictions

Respond in this format:
Dish Name: <name>
Description: <Single sentence only. What is it + 2-3 main ingredients. No marketing language.>
Main Ingredients: <comma-separated list>`;

    console.log('Backend prompt:', prompt);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    console.log('Sending dish response to frontend...');
    res.json({ dish: response.choices[0].message.content });
    console.log('Dish response sent successfully!');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.5. Chat dish suggestion endpoint - generates complete dish but returns summary
app.post('/chat-dish-suggestion', async (req, res) => {
  try {
    const { userMessage, preferences } = req.body;
    
    // Build a comprehensive prompt that includes all preferences
    let completeDishPrompt = `Based on this user request: "${userMessage}", generate a complete dish recipe.

IMPORTANT PREFERENCES TO CONSIDER:`;

    // Add dietary restrictions
    if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
      completeDishPrompt += `\nDIETARY RESTRICTIONS: The dish must be ${preferences.dietaryRestrictions.join(' and ').toLowerCase()}.`;
    }
    
    // Add cuisine preferences
    if (preferences.cuisines && preferences.cuisines.length > 0) {
      completeDishPrompt += `\nCUISINE INSPIRATION: The dish should incorporate ${preferences.cuisines.join(' and ')} elements.`;
    }
    
    // Add plate style preferences
    if (preferences.plateStyles && preferences.plateStyles.length > 0) {
      completeDishPrompt += `\nPLATE STYLE: The dish should be served as a ${preferences.plateStyles[0].toLowerCase()}.`;
    }
    
    // Add classic dish preferences
    if (preferences.classicDishes && preferences.classicDishes.length > 0) {
      completeDishPrompt += `\nCLASSIC DISH INSPIRATION: The dish should incorporate elements from: ${preferences.classicDishes.join(', ')}.`;
    }
    
    // Add ingredient preferences (ingredients to avoid)
    if (preferences.ingredientPreferences && preferences.ingredientPreferences.length > 0) {
      completeDishPrompt += `\nINGREDIENTS TO AVOID: The dish must NOT include: ${preferences.ingredientPreferences.join(', ')}.`;
    }
    
    // Add wanted ingredients (ingredients the user wants to use)
    if (preferences.wantedIngredients && preferences.wantedIngredients.length > 0) {
      completeDishPrompt += `\nWANTED INGREDIENTS: The dish MUST include: ${preferences.wantedIngredients.join(', ')}.`;
    }
    
    // Add wanted styles (style preferences from chat)
    if (preferences.wantedStyles && preferences.wantedStyles.length > 0) {
      completeDishPrompt += `\nWANTED STYLES: The dish should have ${preferences.wantedStyles.join(' and ')} characteristics.`;
    }
    
    // Add wanted dish types (plate style preferences from chat)
    if (preferences.wantedDishTypes && preferences.wantedDishTypes.length > 0) {
      completeDishPrompt += `\nWANTED DISH TYPES: The dish should be served as: ${preferences.wantedDishTypes.join(' or ')}.`;
    }
    
    // Add wanted classic dishes (dish references from chat)
    if (preferences.wantedClassicDishes && preferences.wantedClassicDishes.length > 0) {
      completeDishPrompt += `\nWANTED CLASSIC DISHES: The dish should be inspired by or incorporate elements from: ${preferences.wantedClassicDishes.join(', ')}.`;
    }
    
    // Add wanted dietary preferences (dietary preferences from chat)
    if (preferences.wantedDietary && preferences.wantedDietary.length > 0) {
      completeDishPrompt += `\nWANTED DIETARY: The dish should be ${preferences.wantedDietary.join(' and ')}.`;
    }

    completeDishPrompt += `

Respond with a complete recipe in this exact format:

DISH_NAME: <dish name>
DESCRIPTION: <Keep to 1-2 sentences maximum. Focus on what the dish is and 2-3 key ingredients.>
INGREDIENTS:
- <quantity> <ingredient 1> (e.g., "2 cups rice", "1 lb chicken breast", "3 tbsp olive oil")
- <quantity> <ingredient 2>
- <quantity> <ingredient 3>
... (list all ingredients with specific measurements)

INSTRUCTIONS:
1. <step 1>
2. <step 2>
3. <step 3>
... (list all steps)

NUTRITION:
calories: <number>
protein: <number>
carbs: <number>
fat: <number>
fiber: <number>
sugar: <number>
sodium: <number>

ESTIMATED_TIME: <time string>
NOTES: <any additional notes or tips>

CRITICAL REQUIREMENTS:
- The dish MUST respect all dietary restrictions listed above
- The dish MUST incorporate the specified cuisine(s) and/or classic dishes
- The dish MUST be served in the specified plate style
- The dish MUST NOT include any of the avoided ingredients
- The dish MUST include all wanted ingredients specified above
- The dish MUST incorporate wanted styles and characteristics
- The dish MUST be served in the wanted dish type format
- The dish MUST be inspired by wanted classic dishes
- The dish MUST meet wanted dietary requirements
- All ingredients MUST include specific measurements (cups, tablespoons, pounds, ounces, etc.) to make the recipe followable
- Be creative but stay true to all the requirements above`;

    const completeResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: completeDishPrompt }],
    });

    const completeDishText = completeResponse.choices[0].message.content;
    
    // Parse the complete dish data
    const dishData = parseCompleteDish(completeDishText);
    
    // Generate a chat-friendly summary
    const summaryPrompt = `Based on this dish: "${dishData.title}", create a brief, engaging chat response that:
1. Introduces the dish concept in 1 sentence
2. Mentions 2-3 key ingredients or features
3. DO NOT ask about loading into the app (that will be handled separately)

IMPORTANT: 
- Keep it conversational and under 3 sentences total
- DO NOT include any recipe instructions or steps
- DO NOT include ingredient lists
- DO NOT include nutrition information
- Only mention the dish name, what it is, and 2-3 key ingredients
- Start with "How about..." or similar natural suggestion wording
- DO NOT include "Would you like me to load this into the app" or similar phrases

Example format:
"How about a delicious [dish name] with [ingredient 1], [ingredient 2], and [ingredient 3]?"

Dish name: ${dishData.title}
Dish description: ${dishData.description}`;

    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: summaryPrompt }],
    });

    const chatSummary = summaryResponse.choices[0].message.content;

    res.json({ 
      chatSummary,
      completeDish: dishData
    });
  } catch (err) {
    console.error('Chat dish suggestion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to parse complete dish data
function parseCompleteDish(dishText) {
  const lines = dishText.split('\n');
  const dish = {
    title: '',
    description: '',
    ingredients: [],
    instructions: [],
    nutrition: {},
    estimated_time: '',
    notes: ''
  };

  let currentSection = '';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('DISH_NAME:')) {
      dish.title = trimmedLine.replace('DISH_NAME:', '').trim();
    } else if (trimmedLine.startsWith('DESCRIPTION:')) {
      dish.description = trimmedLine.replace('DESCRIPTION:', '').trim();
    } else if (trimmedLine === 'INGREDIENTS:') {
      currentSection = 'ingredients';
    } else if (trimmedLine === 'INSTRUCTIONS:') {
      currentSection = 'instructions';
    } else if (trimmedLine === 'NUTRITION:') {
      currentSection = 'nutrition';
    } else if (trimmedLine.startsWith('ESTIMATED_TIME:')) {
      dish.estimated_time = trimmedLine.replace('ESTIMATED_TIME:', '').trim();
    } else if (trimmedLine.startsWith('NOTES:')) {
      dish.notes = trimmedLine.replace('NOTES:', '').trim();
    } else if (trimmedLine.startsWith('-') && currentSection === 'ingredients') {
      dish.ingredients.push(trimmedLine.replace('-', '').trim());
    } else if (trimmedLine.match(/^\d+\./) && currentSection === 'instructions') {
      dish.instructions.push(trimmedLine.replace(/^\d+\.\s*/, '').trim());
    } else if (currentSection === 'nutrition' && trimmedLine.includes(':')) {
      const [key, value] = trimmedLine.split(':').map(s => s.trim());
      const numValue = parseInt(value);
      if (!isNaN(numValue)) {
        dish.nutrition[key] = numValue;
      }
    }
  }

  return dish;
}

// 3. Recipe info endpoint
app.post('/recipe-info', async (req, res) => {
  try {
    const { dishName } = req.body;
    console.log('Recipe info request for dish:', dishName);
    
    const prompt = `Generate a detailed recipe for "${dishName}". 

IMPORTANT: You must respond with ONLY valid JSON in this exact format:
{
  "ingredients": ["2 cups rice", "1 lb chicken breast", "3 tbsp olive oil"],
  "instructions": ["step 1", "step 2", "step 3"],
  "nutrition": {
    "calories": 450,
    "protein": 28,
    "carbs": 35,
    "fat": 18,
    "fiber": 6,
    "sugar": 5,
    "sodium": 380
  },
  "estimated_time": "30 minutes",
  "description": "A delicious description of the dish"
}

CRITICAL REQUIREMENTS:
- Response must be ONLY valid JSON, no other text
- **NUTRITION VALUES MUST BE REALISTIC** based on actual ingredients and cooking methods:
  * Light dishes (salads, soups): 150-350 calories
  * Standard meals (pasta, stir-fry): 400-600 calories
  * Hearty dishes (fried, creamy): 600-900 calories
  * Rich desserts: 300-600 calories
- **PROTEIN** should reflect protein sources: meat dishes (25-45g), vegetarian (8-20g), legume-based (15-30g)
- **CARBS** should reflect grain/starch content: rice/pasta dishes (45-80g), low-carb (5-20g), salads (10-30g)
- **FAT** should reflect cooking method: fried/creamy (20-40g), grilled/baked (8-20g), light dishes (5-15g)
- All nutrition values must be numbers (no units like "g" or "mg")
- ALL ingredients MUST include specific measurements (cups, tablespoons, pounds, ounces, etc.)
- Include 6-12 ingredients with measurements
- Include 4-8 cooking steps
- Make the recipe realistic and complete
- Do not include any explanatory text outside the JSON
- Example ingredients: "2 cups rice", "1 lb chicken breast", "3 tbsp olive oil", "1/2 tsp salt"`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    
    console.log('AI response received:', response.choices[0].message.content);
    
    // Parse the string content to JSON
    let recipeObj;
    try {
      const content = response.choices[0].message.content.trim();
      // Try to extract JSON if there's extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : content;
      recipeObj = JSON.parse(jsonString);
      
      // Validate required fields
      if (!recipeObj.ingredients || !Array.isArray(recipeObj.ingredients)) {
        throw new Error('Missing or invalid ingredients array');
      }
      if (!recipeObj.instructions || !Array.isArray(recipeObj.instructions)) {
        throw new Error('Missing or invalid instructions array');
      }
      if (!recipeObj.nutrition || typeof recipeObj.nutrition !== 'object') {
        throw new Error('Missing or invalid nutrition object');
      }
      
      console.log('Recipe parsed successfully:', JSON.stringify(recipeObj, null, 2));
      res.json({ recipe: recipeObj });
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.error('Raw response:', response.choices[0].message.content);
      
      // Return a fallback recipe structure
      const fallbackRecipe = {
        ingredients: ["ingredient 1", "ingredient 2", "ingredient 3"],
        instructions: ["Step 1: Prepare ingredients", "Step 2: Cook according to taste", "Step 3: Serve hot"],
        nutrition: {
          calories: 450,
          protein: 20,
          carbs: 35,
          fat: 15,
          fiber: 6,
          sugar: 5,
          sodium: 350
        },
        estimated_time: "30 minutes",
        description: `A delicious ${dishName} recipe`
      };
      
      res.json({ recipe: fallbackRecipe });
    }
  } catch (err) {
    console.error('Recipe info endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3.5. Cook dish endpoint - generates full recipe only when user wants to cook
app.post('/cook-dish', async (req, res) => {
  try {
    const { dishName } = req.body;
    console.log('Cook dish request for:', dishName);
    
    const prompt = `Generate a detailed recipe for "${dishName}". 

IMPORTANT: You must respond with ONLY valid JSON in this exact format:
{
  "ingredients": ["2 cups rice", "1 lb chicken breast", "3 tbsp olive oil"],
  "instructions": ["step 1", "step 2", "step 3"],
  "nutrition": {
    "calories": 450,
    "protein": 28,
    "carbs": 35,
    "fat": 18,
    "fiber": 6,
    "sugar": 5,
    "sodium": 380
  },
  "estimated_time": "30 minutes",
  "description": "A delicious description of the dish"
}

CRITICAL REQUIREMENTS:
- Response must be ONLY valid JSON, no other text
- **NUTRITION VALUES MUST BE REALISTIC** based on actual ingredients and cooking methods:
  * Light dishes (salads, soups): 150-350 calories
  * Standard meals (pasta, stir-fry): 400-600 calories
  * Hearty dishes (fried, creamy): 600-900 calories
  * Rich desserts: 300-600 calories
- **PROTEIN** should reflect protein sources: meat dishes (25-45g), vegetarian (8-20g), legume-based (15-30g)
- **CARBS** should reflect grain/starch content: rice/pasta dishes (45-80g), low-carb (5-20g), salads (10-30g)
- **FAT** should reflect cooking method: fried/creamy (20-40g), grilled/baked (8-20g), light dishes (5-15g)
- All nutrition values must be numbers (no units like "g" or "mg")
- ALL ingredients MUST include specific measurements (cups, tablespoons, pounds, ounces, etc.)
- Include 6-12 ingredients with measurements
- Include 4-8 cooking steps
- Make the recipe realistic and complete
- Do not include any explanatory text outside the JSON
- Example ingredients: "2 cups rice", "1 lb chicken breast", "3 tbsp olive oil", "1/2 tsp salt"`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    
    console.log('Cook dish AI response received:', response.choices[0].message.content);
    
    // Parse the string content to JSON
    let recipeObj;
    try {
      const content = response.choices[0].message.content.trim();
      // Try to extract JSON if there's extra text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : content;
      recipeObj = JSON.parse(jsonString);
      
      // Validate required fields
      if (!recipeObj.ingredients || !Array.isArray(recipeObj.ingredients)) {
        throw new Error('Missing or invalid ingredients array');
      }
      if (!recipeObj.instructions || !Array.isArray(recipeObj.instructions)) {
        throw new Error('Missing or invalid instructions array');
      }
      if (!recipeObj.nutrition || typeof recipeObj.nutrition !== 'object') {
        throw new Error('Missing or invalid nutrition object');
      }
      
      console.log('Cook dish recipe parsed successfully:', JSON.stringify(recipeObj, null, 2));
      res.json({ 
        recipe: recipeObj,
        message: "Recipe generated for cooking!" 
      });
    } catch (parseError) {
      console.error('Cook dish JSON parsing error:', parseError);
      console.error('Raw response:', response.choices[0].message.content);
      
      // Return a fallback recipe structure
      const fallbackRecipe = {
        ingredients: ["ingredient 1", "ingredient 2", "ingredient 3"],
        instructions: ["Step 1: Prepare ingredients", "Step 2: Cook according to taste", "Step 3: Serve hot"],
        nutrition: {
          calories: 520,
          protein: 28,
          carbs: 42,
          fat: 18,
          fiber: 7,
          sugar: 6,
          sodium: 380
        },
        estimated_time: "30 minutes",
        description: `A delicious ${dishName} recipe`
      };
      
      res.json({ 
        recipe: fallbackRecipe,
        message: "Recipe generated for cooking!" 
      });
    }
  } catch (err) {
    console.error('Cook dish endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Recipe modification endpoint
app.post('/modify-recipe', async (req, res) => {
  try {
    const { dish, modification } = req.body;
    
    console.log('Backend: modify-recipe called');
    console.log('Backend: dish:', dish?.title || dish?.name);
    console.log('Backend: modification:', modification);
    console.log('Backend: Full dish object:', JSON.stringify(dish, null, 2));
    
    // Extract dish name and current recipe info
    const dishName = dish.name || dish.title || 'this dish';
    
    // Handle both flat structure (ingredients, instructions) and nested structure (recipe.ingredients, recipe.instructions)
    const currentIngredients = dish.ingredients ? dish.ingredients.join(', ') : 
                              (dish.recipe && dish.recipe.ingredients) ? dish.recipe.ingredients.join(', ') : '';
    const currentInstructions = dish.instructions ? dish.instructions.join(' ') : 
                               (dish.recipe && dish.recipe.instructions) ? dish.recipe.instructions.join(' ') : '';
    
    console.log('Backend: dishName:', dishName);
    console.log('Backend: currentIngredients:', currentIngredients);
    console.log('Backend: currentInstructions:', currentInstructions);
    
    // Determine if this is a transformative change (dessert, different cuisine, etc.)
    let isTransformative = modification.toLowerCase().includes('dessert') || 
                            modification.toLowerCase().includes('breakfast') ||
                            modification.toLowerCase().includes('appetizer') ||
                            modification.toLowerCase().includes('soup') ||
                            modification.toLowerCase().includes('salad') ||
                            modification.toLowerCase().includes('salad bowl') ||
                            modification.toLowerCase().includes('pasta') ||
                            modification.toLowerCase().includes('pizza') ||
                            modification.toLowerCase().includes('turn this into') ||
                            modification.toLowerCase().includes('make it a') ||
                            modification.toLowerCase().includes('bento box') ||
                            modification.toLowerCase().includes('finger food') ||
                            // Wrap/taco/sandwich/toast transformations are transformative
                            modification.toLowerCase().includes('wrap') ||
                            modification.toLowerCase().includes('taco') ||
                            modification.toLowerCase().includes('sandwich') ||
                            modification.toLowerCase().includes('toast') ||
                            // Cuisine changes are transformative
                            modification.toLowerCase().includes('cuisine') ||
                            modification.toLowerCase().includes('incorporate') ||
                            // Classic dish modifications are transformative
                            modification.toLowerCase().includes('elements from') ||
                            modification.toLowerCase().includes('incorporate elements') ||
                            // Dietary restrictions are transformative changes
                            modification.toLowerCase().includes('vegan') ||
                            modification.toLowerCase().includes('vegetarian') ||
                            modification.toLowerCase().includes('pescatarian') ||
                            modification.toLowerCase().includes('keto') ||
                            modification.toLowerCase().includes('paleo') ||
                            modification.toLowerCase().includes('low carb') ||
                            modification.toLowerCase().includes('low fat') ||
                            modification.toLowerCase().includes('high protein') ||
                            modification.toLowerCase().includes('gluten-free') ||
                            modification.toLowerCase().includes('dairy-free') ||
                            modification.toLowerCase().includes('low sugar') ||
                            modification.toLowerCase().includes('diabetic') ||
                            (modification.toLowerCase().includes('plate style') && (
                              modification.toLowerCase().includes('salad bowl') ||
                              modification.toLowerCase().includes('bento box') ||
                              modification.toLowerCase().includes('finger food')
                            ));
    
    // Style modifications should NOT be transformative - they are modifications to existing dish
    const isStyleModification = modification.toLowerCase().includes('style') && (
      modification.toLowerCase().includes('spicy') ||
      modification.toLowerCase().includes('mexican') ||
      modification.toLowerCase().includes('italian') ||
      modification.toLowerCase().includes('asian') ||
      modification.toLowerCase().includes('indian')
    ) && !modification.toLowerCase().includes('wrap') && !modification.toLowerCase().includes('taco') && !modification.toLowerCase().includes('sandwich') && !modification.toLowerCase().includes('toast') && !modification.toLowerCase().includes('soup') && !modification.toLowerCase().includes('stew') && !modification.toLowerCase().includes('cuisine') && !modification.toLowerCase().includes('incorporate') && !modification.toLowerCase().includes('elements from') && !modification.toLowerCase().includes('incorporate elements');
    
    // Override transformative flag for style modifications
    if (isStyleModification) {
      isTransformative = false;
    }
    
    console.log('Backend: isTransformative:', isTransformative);
    console.log('Backend: isStyleModification:', isStyleModification);
    
    if (isTransformative) {
      // Handle transformative changes
      const prompt = `You are transforming an existing recipe for ${dishName} into something completely different. The user wants to: "${modification}"

Current recipe context:
- Dish Name: ${dishName}
- Ingredients: ${currentIngredients}
- Instructions: ${currentInstructions}

CRITICAL INSTRUCTIONS FOR TRANSFORMATIVE CHANGES:
1. **PRESERVE THE DISH'S ESSENCE**: Keep the main flavors, key ingredients, and character of the original dish
2. **ADAPT THE FORMAT**: Change the dish type (e.g., pasta to soup) while maintaining the core concept
3. **UPDATE THE DISH NAME**: Create a new, appropriate name that reflects both the original and the transformation
4. **MAINTAIN KEY INGREDIENTS**: Keep the primary ingredients from the original dish (e.g., if original has shrimp, keep shrimp)
5. **PRESERVE FLAVORS**: Maintain the main flavor profile (e.g., lemon, garlic, herbs)
6. **ADAPT COOKING METHOD**: Modify instructions to match the new dish type while preserving flavors

SPECIAL INSTRUCTIONS FOR DIETARY RESTRICTIONS:
- If the modification includes dietary restrictions (vegan, vegetarian, keto, etc.), you MUST:
  * Replace non-compliant ingredients with suitable alternatives
  * Adjust cooking methods if necessary
  * Update the dish name to reflect the dietary change
  * Ensure all ingredients meet the dietary requirements
  * Update nutrition information to reflect the changes

EXAMPLE TRANSFORMATION:
Original: "Lemon Garlic Shrimp Pasta"
Transform to: "Soup + Diabetic Friendly"
Result: "Lemon Garlic Shrimp Soup" (diabetic-friendly, using shrimp, lemon, garlic, but as soup)

Please provide the transformed recipe in EXACT JSON format (no extra text, just JSON):

{
  "title": "New Dish Name",
  "description": "Brief description of the transformed dish",
  "ingredients": [
    "1 lb shrimp",
    "2 tbsp olive oil",
    "4 cloves garlic, minced"
  ],
  "instructions": [
    "Step 1",
    "Step 2",
    "Step 3"
  ],
  "nutrition": {
    "calories": 450,
    "protein": 28,
    "carbs": 15,
    "fat": 18,
    "fiber": 3,
    "sugar": 2,
    "sodium": 380
  },
  "estimated_time": "30 minutes",
  "transformation_summary": "A delicious soup version of the original pasta dish, featuring tender shrimp in a flavorful broth with lemon and garlic notes"
}

CRITICAL: 
- Return ONLY valid JSON, no additional text
- All nutrition values must be numbers without units
- All ingredients must include specific measurements
- Preserve the essence and key ingredients of the original dish
- The transformation_summary should describe the NEW dish, not the change made`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });

      let recipeObj;
      try {
        recipeObj = JSON.parse(response.choices[0].message.content);
      } catch (e) {
        console.error('Failed to parse transformative modification JSON:', e);
        console.error('Raw response:', response.choices[0].message.content);
        
        // Try to fix common JSON formatting issues
        let fixedContent = response.choices[0].message.content;
        
        // Remove any text before the first {
        const jsonStart = fixedContent.indexOf('{');
        if (jsonStart > 0) {
          fixedContent = fixedContent.substring(jsonStart);
        }
        
        // Remove any text after the last }
        const jsonEnd = fixedContent.lastIndexOf('}');
        if (jsonEnd > 0 && jsonEnd < fixedContent.length - 1) {
          fixedContent = fixedContent.substring(0, jsonEnd + 1);
        }
        
        // Try parsing the fixed content
        try {
          recipeObj = JSON.parse(fixedContent);
          console.log('Successfully parsed JSON after fixing formatting');
        } catch (e2) {
          console.error('Failed to parse even after fixing formatting:', e2);
          return res.status(500).json({ 
            error: 'Failed to parse transformative modification JSON', 
            raw: response.choices[0].message.content,
            parsingError: e.message
          });
        }
      }

      // Skip image generation during modification - let frontend handle it on dish load
      console.log('Skipping image generation during modification - will generate when user loads dish');

      res.json({ 
        recipe: recipeObj,
        isTransformative: true,
        transformationSummary: recipeObj.transformation_summary || `Transformed ${dishName} into ${recipeObj.title}`,
        updatedDish: {
          title: recipeObj.title,
          description: recipeObj.description,
          summary: recipeObj.transformation_summary || `Transformed ${dishName} into ${recipeObj.title}`,
          image: '', // No image - will be generated when user loads dish
          recipe: recipeObj
        }
      });
      
      console.log('Backend: Sending transformative response:', {
        isTransformative: true,
        transformationSummary: recipeObj.transformation_summary || `Transformed ${dishName} into ${recipeObj.title}`
      });
    } else {
      // Handle minor modifications (original logic)
      const prompt = `You are modifying an existing recipe for ${dishName}. The user wants to make this specific change: "${modification}"

Current recipe context:
- Dish Name: ${dishName}
- Ingredients: ${currentIngredients}
- Instructions: ${currentInstructions}

CRITICAL INSTRUCTIONS - READ CAREFULLY:
This is a MINOR MODIFICATION to an existing dish, NOT a new dish creation. You MUST:

1. **PRESERVE THE DISH'S CORE IDENTITY**: Keep the same main ingredients, cooking method, and overall concept
2. **MAKE ONLY THE REQUESTED CHANGE**: If they say "I don't have maple, add a sweetener instead", ONLY replace maple with another sweetener (honey, brown sugar, agave, etc.)
3. **UPDATE DISH NAME IF NEEDED**: If the change significantly affects the dish's identity (like replacing pesto with tomato dressing), update the title to reflect the new dish. Otherwise, keep the same title
4. **MAINTAIN THE SAME CUISINE STYLE**: Do NOT change the cultural origin or style
5. **PRESERVE THE MAIN INGREDIENTS**: Keep the primary proteins, vegetables, and starches the same
6. **MINIMAL ADJUSTMENTS**: Only modify what's absolutely necessary for the requested change
7. **PRESERVE ALL MEASUREMENTS**: Keep all ingredient measurements exactly the same unless the substitution requires a different amount
8. **MAINTAIN RECIPE STRUCTURE**: Keep the same number of ingredients and steps unless specifically requested to add/remove
9. **STYLE MODIFICATIONS**: For style changes like "spicy mexican style", add appropriate spices and seasonings while keeping the same main ingredients and cooking method

SPECIFIC EXAMPLES:
- "I don't have maple" → Replace maple with honey/brown sugar/agave, keep title and everything else identical
- "Add a sweetener instead of maple" → Replace maple with another sweetener, keep title and dish structure identical  
- "I don't have bacon" → Replace bacon with similar protein (pancetta, ham, etc.), keep title and dish concept identical
- "Make it less spicy" → Reduce chili/spice amounts, keep title and all other ingredients identical
- "Add cheese" → Add cheese to existing dish, keep title, do NOT turn it into a completely different dish
- "Change to wrap" → Add tortilla/wrap and adjust serving method, keep same ingredients and measurements, keep title
- "Change to comfort plate" → Adjust plating, keep same ingredients and measurements, keep title
- "Replace pesto with tomato dressing" → Update title from "Pesto Chicken Salad" to "Tomato Chicken Salad" since pesto is the defining element
- "Replace marinara with alfredo" → Update title from "Marinara Pasta" to "Alfredo Pasta" since sauce defines the dish
- "Make it spicy mexican style" → Add Mexican spices, keep main ingredients, may update title to include "Mexican Style"
- "Make it italian style" → Add Italian herbs, keep main ingredients, may update title to include "Italian Style"

WHAT NOT TO DO:
- "I don't have maple" → Do NOT create a completely different dish
- "Add a sweetener" → Do NOT change the main ingredients or cooking method
- "I don't have bacon" → Do NOT turn it into a vegetarian dish unless specifically requested
- Do NOT reduce ingredient amounts unless specifically requested
- Do NOT change cooking methods unless specifically requested

The modified dish should be recognizable as the SAME dish with only the requested ingredient substitution or minor adjustment.

Please provide the modified recipe in JSON format with these fields:
- "title" (string - update if the change affects dish identity, otherwise keep original)
- "description" (string - describe what the dish IS NOW, not what changed)
- "ingredients" (array of strings with measurements)
- "instructions" (array of steps)
- "nutrition" (object with numeric values only, no units: calories, protein, carbs, fat, fiber, sugar, sodium)
- "estimated_time" (string)
- "modification_summary" (string describing what changed)

IMPORTANT: 
- "title": If replacing a key ingredient (like pesto → tomato), update the title to reflect the new dish
- "description": Describe the final dish, not the modification process. Say "A chicken salad with tomato dressing" not "A pesto salad modified with tomato dressing"
- All nutrition values must be numbers without units (e.g., 30, not "30g")
- All ingredients must include specific measurements (cups, tablespoons, pounds, ounces, etc.)
- Preserve the original dish structure and cooking method
- The modification_summary should explain what was changed (e.g., "Replaced maple syrup with honey", "Added extra cheese")`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });

      let recipeObj;
      try {
        recipeObj = JSON.parse(response.choices[0].message.content);
      } catch (e) {
        console.error('Failed to parse modify-recipe JSON:', e);
        return res.status(500).json({ 
          error: 'Failed to parse modified recipe JSON', 
          raw: response.choices[0].message.content 
        });
      }

      // Skip image generation during modification - let frontend handle it on dish load
      console.log('Skipping image generation during modification - will generate when user loads dish');
      
      if (false) { // Disabled image generation
        try {
          // Use the new dish title if available, otherwise use the original dish name
          const dishTitleForImage = recipeObj.title || dishName;
          console.log('Generating new image for modified dish:', dishTitleForImage);
          const imagePrompt = `A beautiful hand-drawn illustration of a single food dish, specifically ${dish}, in Japanese retro style, flat colors, grainy texture, minimalist design, no text or writing or caption on image, no watermark, not a photo, Subtle lighting with soft shadows. Detailed linework and ornate patterns evoke a timeless, nostalgic atmosphere. The composition should feel intimate, inviting, and slightly cinematic, like a hand-drawn or painted scene with refined details.`;
          
          // Try ModelsLab first
          try {
            console.log('Attempting ModelsLab for modification image...');
            
            const requestBody = {
              prompt: imagePrompt,
              model_id: "boziorealvisxlv4",
              lora_model: "hasui-kawase-style-sd-xl",
              width: "1024",
              height: "1024",
              negative_prompt: "(worst quality:2), (low quality:2), (normal quality:2), (jpeg artifacts), (blurry), (duplicate), text, writing, watermark, signature, photo, realistic, 3d, cgi, computer generated",
              num_inference_steps: "31",
              scheduler: "DPMSolverMultistepScheduler",
              guidance_scale: "7.5",
              enhance_prompt: null
            };
            
            const modelsLabResponse = await axios.post(MODELLAB_API_URL, requestBody, {
              headers: {
                'key': MODELLAB_API_TOKEN,
                'Content-Type': 'application/json'
              },
              // No timeout for initial request - let ModelLab take as long as needed
              maxRedirects: 0,
              validateStatus: (status) => status < 500
            });
          
            // Check if we have a ready image URL in multiple possible locations
            let imageUrl = null;
            
            // Check primary output location
            if (modelsLabResponse.data.output?.[0]) {
              imageUrl = modelsLabResponse.data.output[0];
            }
            // Check meta.output location (where ModelsLab often puts the ready image)
            else if (modelsLabResponse.data.meta?.output?.[0]) {
              imageUrl = modelsLabResponse.data.meta.output[0];
            }
            // Check future_links location (alternative location)
            else if (modelsLabResponse.data.future_links?.[0]) {
              imageUrl = modelsLabResponse.data.future_links[0];
            }
            
            if (imageUrl) {
              newImageUrl = imageUrl;
              console.log('ModelsLab modification image generated:', newImageUrl.substring(0, 50) + '...');
            } else if (modelsLabResponse.data.status === 'processing') {
              // Handle polling for processing status
              const taskId = modelsLabResponse.data.id;
              const fetchUrl = modelsLabResponse.data.fetch_result;
              
              if (!taskId || !fetchUrl) {
                throw new Error('No task ID or fetch URL received for polling');
              }
              
              let attempts = 0;
              const maxAttempts = 120; // 30 seconds max (120 * 0.25s)
              const eta = modelsLabResponse.data.eta || 0.25;
              
              while (attempts < maxAttempts) {
                const delay = Math.min(250, Math.max(100, eta * 1000)); // 100ms to 250ms based on ETA
                await new Promise(resolve => setTimeout(resolve, delay));
                
                try {
                  const pollResponse = await axios.post(fetchUrl, {}, {
                    headers: { 'key': MODELLAB_API_TOKEN },
                    timeout: 2000, // Reduced from 3s to 2s
                    maxRedirects: 0
                  });
                  
                  if (pollResponse.data.status === 'success' && pollResponse.data.output?.[0]) {
                    newImageUrl = pollResponse.data.output[0];
                    console.log('ModelsLab modification image generated (polled):', newImageUrl.substring(0, 50) + '...');
                    break;
                  } else if (pollResponse.data.status === 'failed') {
                    throw new Error(`ModelsLab task failed: ${pollResponse.data.message || 'Unknown error'}`);
                  } else if (pollResponse.data.status === 'error') {
                    throw new Error(`ModelsLab task error: ${pollResponse.data.message || JSON.stringify(pollResponse.data)}`);
                  }
                } catch (pollErr) {
                  console.error('Polling error:', pollErr.message);
                  if (attempts === maxAttempts - 1) {
                    throw pollErr;
                  }
                }
                attempts++;
              }
              
              if (!newImageUrl) {
                throw new Error('Image generation timed out after 30 seconds');
              }
            } else {
              throw new Error(`ModelsLab error: ${modelsLabResponse.data.status}`);
            }
          } catch (modelsLabErr) {
            console.log('ModelsLab failed for modification, trying DALL-E fallback...');
            
            // DALL-E fallback
            try {
              const dalleResponse = await openai.images.generate({
                model: "dall-e-3",
                prompt: imagePrompt,
                n: 1,
                size: "1024x1024",
              });
              
              if (dalleResponse.data && dalleResponse.data[0] && dalleResponse.data[0].url) {
                newImageUrl = dalleResponse.data[0].url;
                console.log('DALL-E modification image generated (fallback):', newImageUrl.substring(0, 50) + '...');
              } else {
                throw new Error('Invalid DALL-E response structure');
              }
            } catch (dalleErr) {
              console.error('Both ModelsLab and DALL-E failed for modification:', dalleErr.message);
              throw dalleErr;
            }
          }
        } catch (imageErr) {
          console.error('Failed to generate new image for modification:', imageErr.message);
          // Continue without new image - use original or placeholder
        }
      }

      res.json({ 
        recipe: recipeObj,
        isTransformative: false,
        modificationSummary: recipeObj.modification_summary || `Modified ${dishName} based on your request`,
        updatedDish: {
          title: recipeObj.title || dishName, // Use AI-provided title if available, otherwise keep original
          description: recipeObj.description,
          summary: recipeObj.modification_summary || `Modified ${dishName} based on your request`,
          image: '', // No image - will be generated when user loads dish
          recipe: recipeObj
        }
      });
      
      console.log('Backend: Sending minor modification response:', {
        isTransformative: false,
        modificationSummary: recipeObj.modification_summary || `Modified ${dishName} based on your request`
      });
    }
  } catch (err) {
    console.error('Modify recipe error:', err);
    console.error('Modify recipe error stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// 5. Optimized image generation endpoint with ModelsLab as primary and DALL-E as fallback
app.post('/generate-image', async (req, res) => {
  const { dish } = req.body;
  const totalStartTime = Date.now();
  
  // Simplified prompt to reduce request size and improve network performance
  const prompt = `A beautiful hand-drawn illustration of a single food dish, specifically ${dish}, in Japanese retro style, flat colors, grainy texture, minimalist design, no text or writing or caption on image, no watermark, not a photo, Subtle lighting with soft shadows. Detailed linework and ornate patterns evoke a timeless, nostalgic atmosphere. The composition should feel intimate, inviting, and slightly cinematic, like a hand-drawn or painted scene with refined details.`;
  
  try {
    
    console.log('=== IMAGE GENERATION TIMING START ===');
    console.log('Request received for dish:', dish);
    
    console.log('Making ModelsLab API call as primary model...');
    console.log('Using ModelsLab API for image generation');
    
    const apiStartTime = Date.now();
    
    // Use ModelsLab as primary model
    try {
      console.log('Attempting ModelsLab primary generation...');
      console.log('ModelsLab using dish:', dish);
      
      const requestBody = {
        prompt: prompt,
        model_id: "boziorealvisxlv4",
        lora_model: "hasui-kawase-style-sd-xl",
        width: "1024",
        height: "1024",
        negative_prompt: "(worst quality:2), (low quality:2), (normal quality:2), (jpeg artifacts), (blurry), (duplicate), text, writing, watermark, signature, photo, realistic, 3d, cgi, computer generated",
        num_inference_steps: "31",
        scheduler: "DPMSolverMultistepScheduler",
        guidance_scale: "7.5",
        enhance_prompt: null
      };
      
      const modelsLabResponse = await axios.post(MODELLAB_API_URL, requestBody, {
        headers: {
          'key': MODELLAB_API_TOKEN,
          'Content-Type': 'application/json'
        },
        // No timeout for initial request - let ModelsLab take as long as needed
        maxRedirects: 0,
        validateStatus: (status) => status < 500
      });
      
      const apiCallTime = Date.now() - apiStartTime;
      console.log(`ModelsLab API call took: ${apiCallTime}ms`);
      console.log('ModelsLab API response status:', modelsLabResponse.status);
      console.log('ModelsLab API response data:', JSON.stringify(modelsLabResponse.data, null, 2));
      
      // Check if we have a ready image URL in multiple possible locations
      let imageUrl = null;
      
      // Check primary output location
      if (modelsLabResponse.data.output?.[0]) {
        imageUrl = modelsLabResponse.data.output[0];
      }
      // Check meta.output location (where ModelsLab often puts the ready image)
      else if (modelsLabResponse.data.meta?.output?.[0]) {
        imageUrl = modelsLabResponse.data.meta.output[0];
      }
      // Check future_links location (alternative location)
      else if (modelsLabResponse.data.future_links?.[0]) {
        imageUrl = modelsLabResponse.data.future_links[0];
      }
      
      if (imageUrl) {
        const totalTime = Date.now() - totalStartTime;
        console.log(`ModelsLab success: ${totalTime}ms | Image: ${imageUrl.substring(0, 50)}...`);
        console.log('ModelsLab: Sending response to frontend...');
        const responseData = { imageUrl };
        console.log('ModelsLab: Response object:', responseData);
        res.json(responseData);
        console.log('ModelsLab: Response sent successfully');
        return;
      } else if (modelsLabResponse.data.status === 'processing') {
        // Handle processing status with polling
        console.log('ModelsLab: Image is processing, starting polling...');
        console.log('ModelsLab processing, eta:', modelsLabResponse.data.eta);
        
        // Get the task ID and fetch URL for polling
        const taskId = modelsLabResponse.data.id;
        const fetchUrl = modelsLabResponse.data.fetch_result;
        
        if (!taskId || !fetchUrl) {
          throw new Error('No task ID or fetch URL received for polling');
        }
        
        console.log('Starting polling for task ID:', taskId);
        console.log('Using fetch URL:', fetchUrl);
        
        // Poll for completion with optimized performance
        let attempts = 0;
        const maxAttempts = 120; // 30 seconds max (120 * 0.25s)
        const eta = modelsLabResponse.data.eta || 0.25; // Use ETA from response or default to 0.25s
        
        while (attempts < maxAttempts) {
          // Use ETA-based polling: start fast, then slow down
          const delay = Math.min(250, Math.max(100, eta * 1000)); // 100ms to 250ms based on ETA
          await new Promise(resolve => setTimeout(resolve, delay));
          
          try {
            const pollResponse = await axios.post(fetchUrl, {}, {
              headers: {
                'key': MODELLAB_API_TOKEN,
                'Content-Type': 'application/json'
              },
              timeout: 2000 // Reduced from 3s to 2s for faster polling
            });
            
            console.log(`Poll attempt ${attempts + 1}:`, pollResponse.data.status);
            console.log(`Poll attempt ${attempts + 1} full response:`, JSON.stringify(pollResponse.data, null, 2));
            
            if (pollResponse.data.status === 'success' && pollResponse.data.output && pollResponse.data.output.length > 0) {
              const imageUrl = pollResponse.data.output[0];
              const totalTime = Date.now() - totalStartTime;
              console.log(`ModelsLab polling success: ${totalTime}ms | Image: ${imageUrl.substring(0, 50)}...`);
              return res.json({ imageUrl: imageUrl });
            } else if (pollResponse.data.status === 'failed') {
              throw new Error(`ModelsLab task failed: ${pollResponse.data.message || 'Unknown error'}`);
            } else if (pollResponse.data.status === 'error') {
              throw new Error(`ModelsLab task error: ${pollResponse.data.message || JSON.stringify(pollResponse.data)}`);
            }
            // If still processing, continue polling
            
          } catch (pollErr) {
            console.error('Polling error:', pollErr.message);
            if (attempts === maxAttempts - 1) {
              throw pollErr;
            }
          }
          
          attempts++;
        }
        
        throw new Error('ModelsLab image generation timed out after 30 seconds');
      } else {
        throw new Error(`ModelsLab error: ${modelsLabResponse.data.status || 'Unknown status'}`);
      }
    } catch (modelsLabErr) {
      console.error('ModelsLab primary generation failed:', modelsLabErr.message);
      console.error('ModelsLab error stack:', modelsLabErr.stack);
      throw modelsLabErr; // Re-throw to trigger DALL-E fallback
    }
    
  } catch (err) {
    console.error('ModelsLab image generation failed:', err.message);
    console.error('Error stack:', err.stack);
    
    // Check if it's a timeout error
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      console.log('ModelsLab request timed out, attempting DALL-E fallback...');
    } else {
      console.log('ModelsLab request failed with error, attempting DALL-E fallback...');
    }
    
    // Try DALL-E fallback
    let dalleErr = null;
    try {
      console.log('Attempting DALL-E fallback...');
      console.log('DALL-E fallback using dish:', dish);
      
      const dalleResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      });
      
      const apiCallTime = Date.now() - apiStartTime;
      console.log(`DALL-E API call took: ${apiCallTime}ms`);
      
      if (dalleResponse.data && dalleResponse.data[0] && dalleResponse.data[0].url) {
        const imageUrl = dalleResponse.data[0].url;
        const totalTime = Date.now() - totalStartTime;
        console.log(`DALL-E fallback success: ${totalTime}ms | Image: ${imageUrl.substring(0, 50)}...`);
        console.log('DALL-E: Sending response to frontend...');
        const responseData = { imageUrl };
        console.log('DALL-E: Response object:', responseData);
        res.json(responseData);
        console.log('DALL-E: Response sent successfully');
        return;
      } else {
        throw new Error('Invalid DALL-E response structure');
      }
    } catch (error) {
      dalleErr = error;
      console.error('DALL-E fallback also failed:', dalleErr.message);
      console.error('DALL-E error stack:', dalleErr.stack);
    }
    
    // If both fail, return error but don't crash the app
    console.error('Both ModelsLab and DALL-E failed, returning error response');
    res.status(500).json({ 
      error: 'Image generation failed', 
      details: 'Both ModelsLab and DALL-E fallback failed',
      modelsLabError: err.message,
      dalleError: dalleErr?.message || 'Unknown DALL-E error'
    });
  }
});

// 6. Remix/Transform Dish endpoint - Always-on remix capability
app.post('/remix-dish', async (req, res) => {
  try {
    const { currentDish, userRequest, preferences = {} } = req.body;
    
    if (!currentDish) {
      return res.status(400).json({ error: 'No current dish provided for remixing' });
    }

    // Build a comprehensive remix prompt
    const prompt = `You are a creative chef with a passion for culinary innovation. The user wants to remix/transform their current dish.

CURRENT DISH:
Title: ${currentDish.title}
Description: ${currentDish.description}
Ingredients: ${currentDish.recipe?.ingredients?.join(', ') || 'Not specified'}
Instructions: ${currentDish.recipe?.instructions?.join('; ') || 'Not specified'}

USER REQUEST: "${userRequest}"

PREFERENCES (if any):
${preferences.dietaryRestrictions ? `Dietary: ${preferences.dietaryRestrictions.join(', ')}` : ''}
${preferences.cuisines ? `Cuisine: ${preferences.cuisines.join(', ')}` : ''}
${preferences.plateStyles ? `Plate Style: ${preferences.plateStyles.join(', ')}` : ''}

CRITICAL REMIX INSTRUCTIONS:
1. **DO NOT suggest a random dish** - You MUST remix the current dish based on the user's request
2. **Preserve the dish's essence** - Keep as many original elements as possible while transforming it
3. **Be creative but logical** - The remix should make sense and be delicious
4. **Respect preferences** - If dietary/cuisine preferences are provided, incorporate them
5. **Maintain structure** - If it's a taco, keep it as a taco; if it's a bowl, keep it as a bowl

EXAMPLES OF GOOD REMIXES:
- "Spicy Mango Shrimp Tacos" → "make it a dessert" → "Sweet Mango Dessert Tacos with candied shrimp and coconut cream"
- "Chicken Caesar Salad" → "make it Italian" → "Italian Caesar with prosciutto, parmesan, and balsamic"
- "Beef Stir Fry" → "make it vegan" → "Tofu and Mushroom Stir Fry with the same sauce and vegetables"

RESPOND IN THIS EXACT FORMAT:
---
REMIX_SUMMARY: <1-2 sentences explaining the transformation and why it works>
RECIPE:
{
  "title": "<remixed dish name>",
  "description": "<what the remixed dish is and key features>",
  "ingredients": [
    "<quantity> <ingredient with measurement>",
    "<quantity> <ingredient with measurement>",
    ...
  ],
  "instructions": [
    "<step 1>",
    "<step 2>",
    ...
  ],
  "nutrition": {
    "calories": <number>,
    "protein": <number>,
    "carbs": <number>,
    "fat": <number>,
    "fiber": <number>,
    "sugar": <number>,
    "sodium": <number>
  },
  "estimated_time": "<time string>"
}
---

IMPORTANT: 
- All nutrition values must be numbers only (no units)
- All ingredients must include specific measurements
- The RECIPE section must be valid JSON
- Focus on the transformation requested, not random suggestions`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8, // Slightly higher creativity for remixes
    });

    const text = response.choices[0].message.content;
    
    // Extract remix summary and recipe JSON
    const summaryMatch = text.match(/REMIX_SUMMARY:(.*?)(RECIPE:|\n\{|\{)/s);
    const remixSummary = summaryMatch ? summaryMatch[1].trim() : '';
    
    const recipeMatch = text.match(/RECIPE:\s*({[\s\S]*})/);
    let recipeObj = null;
    
    if (recipeMatch) {
      try {
        recipeObj = JSON.parse(recipeMatch[1]);
      } catch (e) {
        console.error('Failed to parse remix recipe JSON:', e);
        return res.status(500).json({ 
          error: 'Failed to parse remixed recipe JSON', 
          raw: recipeMatch[1],
          summary: remixSummary 
        });
      }
    } else {
      return res.status(500).json({ 
        error: 'No recipe JSON found in remix response', 
        raw: text,
        summary: remixSummary 
      });
    }

    // Skip image generation during remix - let frontend handle it on dish load
    console.log('Skipping image generation during remix - will generate when user loads dish');

    res.json({ 
      remixSummary, 
      recipe: recipeObj,
      originalDish: currentDish.title,
      updatedDish: {
        title: recipeObj.title,
        description: recipeObj.description,
        summary: remixSummary,
        image: '', // No image - will be generated when user loads dish
        recipe: recipeObj
      }
    });
  } catch (err) {
    console.error('Remix dish error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Legacy fuse-dish endpoint (keeping for backward compatibility)
app.post('/fuse-dish', async (req, res) => {
  try {
    const { currentDish, modification } = req.body;
    const dishContext = JSON.stringify(currentDish, null, 2);
    const prompt = `Given this dish as JSON:
${dishContext}

And this user request: "${modification}"

Suggest a new fusion or modified dish. Respond in this format:
---
SUMMARY: <1-2 sentence intro, no ingredients, no instructions, just what the new dish is and why it's interesting>
RECIPE:
{
  "title": <dish name>,
  "description": <concise description>,
  "ingredients": [ ... ],
  "instructions": [ ... ],
  "nutrition": { "calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>, "fiber": <number>, "sugar": <number>, "sodium": <number> },
  "estimated_time": <string>
}
---
IMPORTANT: The RECIPE must be valid JSON. Nutrition values must be numbers only, no units.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.choices[0].message.content;
    // Extract summary and recipe JSON
    const summaryMatch = text.match(/SUMMARY:(.*?)(RECIPE:|\n\{|\{)/s);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const recipeMatch = text.match(/RECIPE:\s*({[\s\S]*})/);
    let recipeObj = null;
    if (recipeMatch) {
      try {
        recipeObj = JSON.parse(recipeMatch[1]);
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse recipe JSON', raw: recipeMatch[1] });
      }
    } else {
      return res.status(500).json({ error: 'No recipe JSON found', raw: text });
    }
    
    // Skip image generation during fusion - let frontend handle it on dish load
    console.log('Skipping image generation during fusion - will generate when user loads dish');
    
    res.json({ 
      summary, 
      recipe: recipeObj,
      updatedDish: {
        title: recipeObj.title,
        description: recipeObj.description,
        summary: summary,
        image: '', // No image - will be generated when user loads dish
        recipe: recipeObj
      }
    });
  } catch (err) {
    console.error('Fuse dish error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
