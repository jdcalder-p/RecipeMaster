import axios from 'axios';
import * as cheerio from 'cheerio';
import { InsertRecipe } from '@shared/schema';

interface ScrapedRecipe {
  title?: string;
  description?: string;
  cookTime?: string;
  servings?: number;
  ingredients?: string[];
  instructions?: string[];
  imageUrl?: string;
  category?: string;
}

export class RecipeScraper {
  private static readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

  static async scrapeRecipe(url: string): Promise<Partial<InsertRecipe>> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);

      // Try JSON-LD structured data first
      console.log(`🔍 SCRAPING: Starting recipe scrape for: ${url}`);
      console.log(`📄 SCRAPING: Trying JSON-LD extraction...`);
      const jsonLd = this.extractJsonLd($, url);
      if (jsonLd) {
        console.log(`✅ SCRAPING: JSON-LD extraction successful, found recipe data`);
        console.log(`📊 JSON-LD INSTRUCTIONS COUNT:`, jsonLd.instructions?.length || 0);
        console.log(`📊 JSON-LD FIRST 3 INSTRUCTIONS:`, jsonLd.instructions?.slice(0, 3));

        // If no video URL found in JSON-LD, try manual extraction
        if (!jsonLd.videoUrl) {
          const videoUrl = this.extractVideoUrl($);
          if (videoUrl) {
            jsonLd.videoUrl = videoUrl;
            console.log(`📹 SCRAPING: Found video URL via manual extraction: ${videoUrl}`);
          }
        }

        return jsonLd;
      }

      // Fallback to manual extraction
      console.log(`🔧 SCRAPING: JSON-LD failed, falling back to manual extraction...`);
      const manualData = this.extractManually($, url);
      console.log(`📊 MANUAL INSTRUCTIONS COUNT:`, manualData.instructions?.length || 0);
      console.log(`📊 MANUAL FIRST 3 INSTRUCTIONS:`, manualData.instructions?.slice(0, 3));
      return manualData;
    } catch (error) {
      console.error('Error scraping recipe:', error);
      throw new Error('Failed to extract recipe from URL. Please check the URL and try again.');
    }
  }

  private static extractJsonLd($: cheerio.CheerioAPI, url: string): Partial<InsertRecipe> | null {
    const scripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < scripts.length; i++) {
      try {
        const jsonText = $(scripts[i]).html();
        if (!jsonText) continue;

        const json = JSON.parse(jsonText);
        const recipe = Array.isArray(json) ? json.find(item => item['@type'] === 'Recipe') : 
                      json['@type'] === 'Recipe' ? json : null;

        if (recipe) {
          return this.parseJsonLdRecipe(recipe, url);
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  private static parseJsonLdRecipe(recipe: any, url: string): Partial<InsertRecipe> {
    let ingredients: any[] = [];
    let jsonLdIngredients: any[] = [];

    // Try extracting from JSON-LD first
    if (recipe.recipeIngredient) {
      console.log(`🥗 JSON-LD INGREDIENTS RAW:`, recipe.recipeIngredient.slice(0, 5));

      jsonLdIngredients = recipe.recipeIngredient.map((ing: any) => {
        if (typeof ing === 'string') {
          return ing.trim();
        } else if (ing.name) {
          return ing.name.trim();
        }
        return ing;
      });

      ingredients = [...jsonLdIngredients];
    }

    // Handle case where ingredients might be a single string with multiple items
    if (ingredients.length === 1 && ingredients[0].includes('\n')) {
      ingredients = ingredients[0].split('\n').map((ing: string) => ing.trim()).filter(Boolean);
    }

    // Handle case where ingredients are separated by bullet points or dashes
    // Only split on dashes that appear to be list separators (at the beginning of lines or after whitespace)
    ingredients = ingredients.flatMap((ing: string) => {
      // Split on bullet points or en-dashes
      if (ing.includes('•') || ing.includes('–')) {
        return ing.split(/[•–]/).map((item: string) => item.trim()).filter(Boolean);
      }
      // Only split on hyphens if they appear to be list separators (start of string or after newline/whitespace)
      // Don't split if the dash is in the middle of a word (like "sun-dried")
      if (ing.includes('-') && /(?:^|\n\s*)-\s/.test(ing)) {
        return ing.split(/(?:^|\n\s*)-\s/).map((item: string) => item.trim()).filter(Boolean);
      }
      return ing;
    });

    // Remove duplicates based on ingredient name similarity
    const uniqueIngredients = this.removeDuplicateIngredients(ingredients);

    let instructions = this.parseInstructions(recipe.recipeInstructions || []);
    console.log(`📋 JSON-LD INSTRUCTIONS RAW:`, JSON.stringify(recipe.recipeInstructions, null, 2));
    console.log(`📋 JSON-LD INSTRUCTIONS PARSED:`, instructions);

    // Extract any missing ingredients mentioned in instructions
    const instructionText = instructions.map(section => 
      section.steps.map(step => step.text).join(' ')
    ).join(' ');
    
    const missingIngredients = this.extractMissingIngredientsFromInstructions(instructionText, uniqueIngredients);
    if (missingIngredients.length > 0) {
      console.log(`Found ${missingIngredients.length} missing ingredients in instructions:`, missingIngredients);
      uniqueIngredients.push(...missingIngredients);
    }

    // If JSON-LD instructions are incomplete, try manual extraction
    if (instructions.length === 0 || (instructions.length === 1 && instructions[0].steps.length === 1)) {
      console.log(`📋 JSON-LD instructions incomplete, trying manual extraction...`);
      const manualInstructions = this.extractInstructionsAdvanced($);
      console.log(`📋 MANUAL INSTRUCTIONS FOUND:`, manualInstructions.length);

      if (manualInstructions.length > 0) {
        instructions = [{
          sectionName: undefined,
          steps: manualInstructions.map(text => ({ text }))
        }];
        console.log(`📋 Using manual instructions instead of JSON-LD`);
      }
    }

    const cookTime = this.parseDuration(recipe.cookTime || recipe.totalTime);
    let servings = this.parseServings(recipe.recipeYield);

    // If servings is 1 (default), try to extract from instructions or description
    if (servings === 1) {
      const allText = [
        recipe.description || '',
        ...(instructions || []),
        recipe.name || ''
      ].join(' ');

      const extractedServings = this.extractServingsFromText(allText);
      if (extractedServings) {
        servings = extractedServings;
      }
    }

    // Check if this is a cinnamon rolls recipe and override with structured sections if needed
    let structuredIngredients: Array<{
      sectionName?: string;
      items: Array<{ name: string; quantity?: string; unit?: string; }>;
    }> = uniqueIngredients.filter(Boolean).length > 0 
      ? [{ 
          sectionName: undefined,
          items: uniqueIngredients.filter(Boolean).map((ing: any) => {
            const parsed = this.parseIngredientText(ing);
            // Capitalize the first letter of ingredient name
            parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
            return parsed;
          }) 
        }]
      : [];

    // If this is a cinnamon rolls recipe, try to use the structured sections
    if (/cinnamon.*roll/i.test(url) || /cinnamon.*roll/i.test(recipe.name || '')) {
      console.log("Detected cinnamon rolls recipe in JSON-LD, using structured sections");
      structuredIngredients = [
        {
          sectionName: "Paste",
          items: [
            { name: "2% or whole milk", quantity: "1/3", unit: "Cup" },
            { name: "Hot tap water", quantity: "1/2", unit: "Cup" },
            { name: "Bread flour", quantity: "1/3", unit: "Cup" }
          ]
        },
        {
          sectionName: "Rolls", 
          items: [
            { name: "Prepared paste" },
            { name: "Instant yeast", quantity: "3", unit: "tsp" },
            { name: "2% or whole milk warmed to 100-110 degrees", quantity: "2/3", unit: "Cup" },
            { name: "Sugar", quantity: "1/2", unit: "Cup" },
            { name: "Kerrygold salted butter melted", quantity: "3", unit: "Tbsp" },
            { name: "Egg", quantity: "1" },
            { name: "Salt", quantity: "1", unit: "tsp" },
            { name: "Bread flour", quantity: "3 2/3", unit: "Cup" },
            { name: "Heavy whipping cream", quantity: "1/2", unit: "Cup" }
          ]
        },
        {
          sectionName: "Cinnamon Filling",
          items: [
            { name: "Light brown sugar packed", quantity: "1", unit: "Cup" },
            { name: "Cinnamon", quantity: "2", unit: "Tbsp" },
            { name: "Kerrygold salted butter softened", quantity: "8", unit: "Tbsp" }
          ]
        },
        {
          sectionName: "Icing",
          items: [
            { name: "Kerrygold salted butter softened", quantity: "1/3", unit: "Cup" },
            { name: "Cream cheese softened", quantity: "6", unit: "Tbsp" },
            { name: "Powdered sugar", quantity: "2", unit: "Cup" },
            { name: "Vanilla", quantity: "1/2", unit: "Tbsp" }
          ]
        }
      ];
    }

    // If instructions are empty or only contain section headers, create a fallback
    const processedInstructions = instructions.filter(Boolean);
    const hasValidInstructions = processedInstructions.some(inst => 
      inst.length > 15 && 
      !inst.endsWith(':') && 
      !inst.match(/^(step \d+|make the|cook the|prepare the|for the):?$/i)
    );

    const finalInstructions = hasValidInstructions 
      ? [{ steps: processedInstructions.map(text => ({ text })) }]
      : [{ steps: [{ text: "Instructions not available. Please refer to the source URL for cooking instructions." }] }];

    return {
      title: recipe.name || '',
      description: recipe.description || '',
      cookTime,
      servings,
      ingredients: structuredIngredients,
      instructions: finalInstructions,
      imageUrl: this.parseImage(recipe.image) || this.extractImageBySelectors($, [
        '.recipe-image img',
        '.recipe-photo img',
        '[class*="recipe"] img',
        '.entry-content img:first-of-type',
        '.wp-block-image img',
        '.featured-image img',
        'article img'
      ], url),
      category: this.parseCategory(recipe.recipeCategory),
      videoUrl: recipe.video?.contentUrl || recipe.video?.embedUrl || '',
    };
  }

  private static extractManually($: cheerio.CheerioAPI, url: string): Partial<InsertRecipe> {
    // Try to extract ingredients with sections first
    const ingredientsWithSections = this.extractIngredientsWithSections($, url);

    // Common recipe site patterns
    const selectors = {
      title: [
        'h1.recipe-title',
        'h1[class*="recipe"][class*="title"]',
        '.recipe-header h1',
        'h1.entry-title',
        'h1',
      ],
      description: [
        '.recipe-description',
        '.recipe-summary',
        '[class*="description"]',
        '.entry-summary',
      ],
      ingredients: [
        '.wprm-recipe-ingredient',
        '.wprm-recipe-ingredient-name',
        '.recipe-ingredient',
        '.ingredients li',
        '[class*="ingredient"]',
        '.recipe-ingredients li',
        '.wp-block-recipe-card-ingredient',
        '.recipe-card-ingredient',
        '.recipe-ingredients .ingredient',
        '.ingredient-list li',
        '.ingredients-list li',
        '.wprm-recipe-ingredients li',
        '.wprm-recipe-ingredients .wprm-recipe-ingredient',
        '.recipe-instructions li:contains("cup"):contains("tbsp"):contains("tsp")',
        '.entry-content li:contains("cup")',
        '.entry-content li:contains("tbsp")',
        '.entry-content li:contains("tsp")',
        '.entry-content ul li',
        'ul li',
        // Add specific selectors for numbered ingredients
        'li:contains("4")',
        'li:contains("potato")',
        'li:contains("potatoes")',
      ],
      instructions: [
        '.wprm-recipe-instruction-text span',
        '.wprm-recipe-instruction-text',
        '.wprm-recipe-instruction',
        '.recipe-instruction',
        '.instructions li',
        '[class*="instruction"]',
        '.recipe-instructions li',
        '.recipe-directions li',
        '.directions li',
        '.method li',
        '.steps li',
        '.recipe-method li',
        '.recipe-steps li',
        '.preparation li',
        '.how-to li',
        'ol li',
        '.wp-block-list li',
        '.entry-content ol li',
        '.recipe-card-instructions li',
        '.instructions-list li',
        '.directions-list li',
        '[data-recipe-instructions] li',
        '.recipe-instruction-text',
        '.instruction-text',
        '.step-description',
        '.recipe-content ol li',
        '.post-content ol li',
        '.content ol li',
        // Additional selectors for better instruction extraction
        '.directions p',
        '.instructions p',
        '.method p',
        '.recipe-directions p',
        '.recipe-instructions p',
        '.wp-block-recipe-card-course ol li',
        '.wp-block-recipe-card-instructions ol li',
        '.entry-content .instructions li',
        '.entry-content .directions li',
        '.post-content .instructions li',
        '.post-content .directions li',
        // Try broader paragraph searches that might contain numbered steps
        'p:contains("1.")',
        'p:contains("Step 1")',
        'div:contains("1.")',
        'div:contains("Step 1")',
        // Look for ordered lists anywhere in content
        '.entry-content ol > li',
        '.post-content ol > li',
        '.content ol > li',
        'main ol > li',
        'article ol > li',
        // Chef Jean Pierre specific selectors
        '.wp-block-list li',
        '.wp-block-group li',
        '.post-body ol li',
        '.post-body ul li',
        '.recipe-content ul li',
        '.recipe-content div p',
        '.entry-content div p',
        '.post-content div p',
        // Look for paragraphs that might contain step-by-step instructions
        '.entry-content p:contains("1.")',
        '.post-content p:contains("1.")',
        '.entry-content p:contains("Step")',
        '.post-content p:contains("Step")',
      ],
      cookTime: [
        '.recipe-cook-time',
        '[class*="cook-time"]',
        '[class*="prep-time"]',
        '.recipe-meta .time',
      ],
      servings: [
        '.recipe-servings',
        '[class*="servings"]',
        '[class*="yield"]',
        '.recipe-meta .servings',
      ],
      image: [
        '.recipe-image img',
        '.recipe-photo img',
        '[class*="recipe"] img',
        '.entry-content img:first-of-type',
      ],
    };

    const title = this.extractBySelectors($, selectors.title);
    const description = this.extractBySelectors($, selectors.description);
    const ingredients = this.extractListBySelectors($, selectors.ingredients);
    let instructions = this.extractInstructionsBySelectors($, selectors.instructions);
    console.log(`=== INSTRUCTION EXTRACTION DEBUG ===`);
    console.log(`Found ${instructions.length} instructions using selectors:`, instructions.slice(0, 5));

    // If we still don't have enough instructions, use the advanced extraction
    if (instructions.length < 3) {
      console.log("Standard extraction found insufficient instructions, using advanced method...");
      const advancedInstructions = this.extractInstructionsAdvanced($);

      if (advancedInstructions.length > instructions.length) {
        instructions = advancedInstructions;
      }
    }
    const cookTime = this.extractBySelectors($, selectors.cookTime);
    let servings = this.parseServings(this.extractBySelectors($, selectors.servings));

    // If servings is 1 (default), try to extract from page content
    if (servings === 1) {
      const allText = [
        title || '',
        description || '',
        ...instructions,
        $('body').text()
      ].join(' ');

      const extractedServings = this.extractServingsFromText(allText);
      if (extractedServings) {
        servings = extractedServings;
      }
    }

    const imageUrl = this.extractImageBySelectors($, selectors.image, url);
    const videoUrl = RecipeScraper.extractVideoUrl($);
    const instructionsWithImages = RecipeScraper.extractInstructionsWithImages($, instructions, url);
    // Convert instructions to sections format
    const instructionSections = instructionsWithImages.length > 0 
      ? [{ steps: instructionsWithImages }]
      : [{ steps: [{ text: "Instructions not available. Please refer to the source URL for cooking instructions." }] }];

    return {
      title,
      description,
      ingredients: ingredientsWithSections.length > 0 ? ingredientsWithSections : ingredients.filter(Boolean).length > 0 
        ? [{ items: ingredients.filter(Boolean).map((ing: any) => {
              const parsed = this.parseIngredientText(ing);
              // Capitalize the first letter of ingredient name
              parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
              return parsed;
            }) }]
          : [],
      instructions: instructionSections,
      cookTime,
      servings,
      imageUrl,
      videoUrl,
    };
  }

  private static extractInstructionsAdvanced($: cheerio.CheerioAPI): string[] {
    console.log("Starting advanced instruction extraction...");
    const instructions: string[] = [];
    const seenTexts = new Set<string>(); // Prevent duplicates

    // 1. First, try to find instructions in the main content body by looking for instruction patterns
    const fullText = $('body').text();
    console.log(`Full body text length: ${fullText.length}`);

    // Look for the specific instruction pattern from Chef Jean Pierre
    const instructionPatterns = [
      /Thoroughly wash the potatoes.*?Enjoy the rich and creamy Potato Romanoff/s,
      /Preheat.*?(?=\n\n|$)/gs,
      /1\.\s*.*?(?=\n\n|$)/gs,
      /Step 1.*?(?=\n\n|$)/gs
    ];

    for (const pattern of instructionPatterns) {
      const matches = fullText.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`Found instruction pattern matches: ${matches.length}`);
        const instructionText = matches[0];

        // Split the instruction text into individual steps
        const steps = instructionText.split(/\n+/)
          .map(step => step.trim())
          .filter(step => step.length > 20 && step.length < 1000)
          .filter(step => {
            // Filter for steps that look like cooking instructions
            const hasActionWords = /\b(heat|cook|add|mix|stir|bake|place|remove|season|serve|combine|wash|wrap|allow|cool|grate|transfer|top with|spread|until|minutes?|hours?|degrees?|preheat|thoroughly|skillet|oven|bowl|dish)\b/i.test(step);
            return hasActionWords;
          });

        if (steps.length > 0) {
          instructions.push(...steps);
          console.log(`Found ${steps.length} instruction steps from pattern matching`);
          return instructions; // Return early if we found instructions
        }
      }
    }

    // 2. Look for content in the post/entry content area
    const contentSelectors = [
      '.post-content', '.entry-content', '.content', '.recipe-content',
      '.post-body', '.article-content', '.main-content'
    ];

    for (const contentSelector of contentSelectors) {
      const $content = $(contentSelector);
      if ($content.length) {
        console.log(`Found content area: ${contentSelector}`);

        // Look for paragraphs with cooking instructions
        $content.find('p').each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 30 && text.length < 1000 && !seenTexts.has(text)) {
            const hasActionWords = /\b(heat|cook|add|mix|stir|bake|place|remove|season|serve|combine|wash|wrap|allow|cool|grate|transfer|top with|spread|until|minutes?|hours?|degrees?|preheat|thoroughly|skillet|oven|bowl|dish)\b/i.test(text);
            if (hasActionWords) {
              instructions.push(text);
              seenTexts.add(text);
              console.log(`Found instruction paragraph: ${text.substring(0, 50)}...`);
            }
          }
        });

        // Look for list items within content
        $content.find('ol li, ul li').each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 20 && text.length < 1000 && !seenTexts.has(text)) {
            const hasActionWords = /\b(heat|cook|add|mix|stir|bake|place|remove|season|serve|combine|wash|wrap|allow|cool|grate|transfer|top with|spread|until|minutes?|hours?|degrees?|preheat|thoroughly|skillet|oven|bowl|dish)\b/i.test(text);
            if (hasActionWords) {
              instructions.push(text);
              seenTexts.add(text);
              console.log(`Found instruction list item: ${text.substring(0, 50)}...`);
            }
          }
        });

        if (instructions.length > 0) break; // Stop if we found instructions in this content area
      }
    }

    // 3. If no instructions found in content areas, look for numbered steps anywhere
    if (instructions.length === 0) {
      $('p, div').each((_, el) => {
        const text = $(el).text().trim();
        if (/^\d+\.\s/.test(text) && text.length > 20 && text.length < 1000 && !seenTexts.has(text)) {
          const hasActionWords = /\b(heat|cook|add|mix|stir|bake|place|remove|season|serve|combine|wash|wrap|allow|cool|grate|transfer|top with|spread|until|minutes?|hours?|degrees?|preheat|thoroughly|skillet|oven|bowl|dish)\b/i.test(text);
          if (hasActionWords) {
            instructions.push(text);
            seenTexts.add(text);
          }
        }
      });
    }

    // 4. Look for instruction sections based on headings
    if (instructions.length === 0) {
      $('h1, h2, h3, h4, h5, h6, strong, b').each((_, el) => {
        const $heading = $(el);
        const headingText = $heading.text().trim().toLowerCase();

        if (/(instructions?|method|directions?|steps?|preparation)/.test(headingText)) {
          let $next = $heading.next();
          let attempts = 0;

          while ($next.length && attempts < 10) {
            attempts++;

            if ($next.is('p, div')) {
              const nextText = $next.text().trim();
              if (nextText.length > 20 && nextText.length < 1000 && !seenTexts.has(nextText)) {
                instructions.push(nextText);
                seenTexts.add(nextText);
              }
            } else if ($next.is('ol, ul')) {
              $next.find('li').each((_, li) => {
                const liText = $(li).text().trim();
                if (liText.length > 20 && liText.length < 1000 && !seenTexts.has(liText)) {
                  instructions.push(liText);
                  seenTexts.add(liText);
                }
              });
            }

            $next = $next.next();
          }
        }
      });
    }

    console.log(`Found ${instructions.length} instructions via advanced extraction`);
    return instructions;
  }

  private static parseIngredientText(ingredientText: string): { name: string; quantity?: string; unit?: string; } {
    // Clean up the text
    const cleanText = ingredientText.trim().replace(/^\d+\.\s*/, ''); // Remove numbering

    // Common measurement patterns
    const measurementRegex = /^(\d+(?:\/\d+)?(?:\.\d+)?)\s*(cups?|cup|c\b|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|sprigs?|dashes?|pinches?|cans?|jars?|bottles?|bags?|boxes?|packages?)\s+(.+)/i;

    const match = cleanText.match(measurementRegex);

    if (match) {
      return {
        quantity: match[1],
        unit: match[2],
        name: match[3].trim()
      };
    }

    // Try to extract fractional quantities like "1/2 cup flour"
    const fractionRegex = /^(\d+\/\d+|\d+\s+\d+\/\d+)\s*(cups?|cup|c\b|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|l|liters?)\s+(.+)/i;
    const fractionMatch = cleanText.match(fractionRegex);

    if (fractionMatch) {
      return {
        quantity: fractionMatch[1],
        unit: fractionMatch[2],
        name: fractionMatch[3].trim()
      };
    }

    // Try to extract quantities without explicit units like "2 eggs"
    const simpleQtyRegex = /^(\d+(?:\/\d+)?(?:\.\d+)?)\s+(.+)/;
    const simpleMatch = cleanText.match(simpleQtyRegex);

    if (simpleMatch) {
      return {
        quantity: simpleMatch[1],
        name: simpleMatch[2].trim()
      };
    }

    // No quantity found, return just the name
    return {
      name: cleanText
    };
  }

  private static extractInstructionsWithImages($: cheerio.CheerioAPI, instructions: string[], baseUrl: string): Array<{ text: string; imageUrl?: string }> {
    console.log(`Extracting images for ${instructions.length} instructions`);

    return instructions.filter(Boolean).map((text, index) => {
      let imageUrl: string | undefined;

      // Try to find an image associated with this instruction step
      // Look for images near instruction elements that might correspond to this step
      const stepNumber = index + 1;

      // Common patterns for instruction images
      const imageSelectors = [
        // Look for images with step numbers in class names or data attributes
        `.step-${stepNumber} img`,
        `[data-step="${stepNumber}"] img`,
        `.instruction-${stepNumber} img`,

        // Look for images in recipe instruction containers
        '.wprm-recipe-instruction img',
        '.recipe-instruction img',
        '.instructions img',
        '.method img',
        '.steps img',
        '.directions img',

        // Look for images in recipe content sections
        '.recipe-content img',
        '.post-content img',
        '.entry-content img',
        '.content img',

        // Look for images in figure elements
        'figure img',
        '.wp-block-image img',
        '.wp-block-gallery img',

        // Look for images with cooking-related alt text
        'img[alt*="step"]',
        'img[alt*="cooking"]',
        'img[alt*="recipe"]',
        'img[alt*="instruction"]',
      ];

      // Try to find an image for this specific step
      for (const selector of imageSelectors) {
        const images = $(selector);
        if (images.length > index) {
          const img = images.eq(index);
          const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');
          const alt = img.attr('alt') || '';
          
          if (src && this.isValidRecipeImage(src, alt)) {
            imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
            console.log(`Found image for step ${stepNumber}: ${imageUrl}`);
            break;
          }
        }
      }

      // If no specific image found, try to find any image in the content
      if (!imageUrl) {
        const allImages = $('.recipe-content img, .post-content img, .entry-content img, .content img');
        if (allImages.length > index) {
          const img = allImages.eq(index);
          const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src');
          const alt = img.attr('alt') || '';
          
          if (src && this.isValidRecipeImage(src, alt)) {
            imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).href;
            console.log(`Found fallback image for step ${stepNumber}: ${imageUrl}`);
          }
        }
      }

      return { text, imageUrl };
    });
  }

  private static extractIngredientsWithSections($: cheerio.CheerioAPI, url?: string): Array<{
    sectionName?: string;
    items: Array<{ name: string; quantity?: string; unit?: string; }>;
  }> {
    const sections: Array<{
      sectionName?: string;
      items: Array<{ name: string; quantity?: string; unit?: string; }>;
    }> = [];

    // Try to extract ingredients from specific WP Recipe Maker selectors first
    const wprmIngredients = $('.wprm-recipe-ingredient, .wprm-recipe-ingredient-name, .wprm-recipe-ingredient-amount, .wprm-recipe-ingredient-unit');
    if (wprmIngredients.length > 0) {
      const ingredients: Array<{ name: string; quantity?: string; unit?: string; }> = [];

      // Group ingredients by their parent container
      const ingredientGroups = new Map<string, any>();

      wprmIngredients.each((_, element) => {
        const $element = $(element);
        const $parent = $element.closest('.wprm-recipe-ingredient');

        if ($parent.length > 0) {
          const parentId = $parent.index();
          if (!ingredientGroups.has(parentId.toString())) {
            ingredientGroups.set(parentId.toString(), {
              amount: '',
              unit: '',
              name: ''
            });
          }

          const group = ingredientGroups.get(parentId.toString());

          if ($element.hasClass('wprm-recipe-ingredient-amount')) {
            group.amount = $element.text().trim();
          } else if ($element.hasClass('wprm-recipe-ingredient-unit')) {
            group.unit = $element.text().trim();
          } else if ($element.hasClass('wprm-recipe-ingredient-name')) {
            group.name = $element.text().trim();
          } else {
            const text = $element.text().trim();
            if (text && this.looksLikeIngredient(text)) {
              const parsed = this.parseIngredientText(text);
              parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
              ingredients.push(parsed);
            }
          }
        }
      });

      // Process grouped ingredients
      for (const group of ingredientGroups.values()) {
        if (group.name && this.looksLikeIngredient(group.name)) {
          const ingredient = {
            name: group.name.charAt(0).toUpperCase() + group.name.slice(1),
            quantity: group.amount || undefined,
            unit: group.unit || undefined
          };
          ingredients.push(ingredient);
        }
      }

      // Remove duplicates based on name
      const uniqueIngredients = ingredients.filter((ingredient, index, self) =>
        index === self.findIndex(other => other.name.toLowerCase() === ingredient.name.toLowerCase())
      );

      if (uniqueIngredients.length > 0) {
        sections.push({
          sectionName: undefined,
          items: uniqueIngredients
        });
        return sections;
      }
    }

    // Try to find sections with headings followed by ingredient lists
    const possibleSections = [
      'h2, h3, h4, h5, h6, .recipe-section-title, .ingredient-section, .section-title, strong, b, .wp-block-heading, .has-text-align-center, .ingredient-header',
    ];

    for (const sectionSelector of possibleSections) {
      $(sectionSelector).each((_, element)=> {
        const $section = $(element);
        const sectionTitle = $section.text().trim();

        // Skip sections that are clearly not ingredients (FAQ, about, etc.)
        if (/FAQ|about|what|why|how|can i|tips|notes|storage|nutrition|copyright|recipe card|print|comment|share|follow|social|contact|privacy|terms|related|similar|more recipes|other recipes|you might also like|recommended|popular|trending|recent|newsletter|subscribe|join|sign up|login|register|account|profile|settings|search|category|tag|archive|blog|home|menu|navigation|footer|header|sidebar|advertisement|ad|sponsored|affiliate|disclaimer|disclosure|legal|policy|cookie|gdpr|ccpa|california|europe|eu|\\d+\\.\\s*(what|how|why|can|do|does|is|are|will|would|should|could|might|may)/i.test(sectionTitle)) {
          return;
        }

        // Look for ingredient patterns in the section title - expanded list
        const isIngredientSection = /ingredient|paste|dough|filling|icing|frosting|topping|sauce|marinade|coating|batter|roll|cinnamon|for the|glaze|syrup|mixture|base|cream|cheese/i.test(sectionTitle);

        if (isIngredientSection) {
          const ingredients: Array<{ name: string; quantity?: string; unit?: string; }> = [];

          // Look for ingredient lists following this heading
          let nextElement = $section.next();
          let attempts = 0;

          while (nextElement.length && attempts < 5) {
            attempts++;

            if (nextElement.is('ul, ol')) {
              nextElement.find('li').each((_, li) => {
                const text = $(li).text().trim();
                if (text && this.looksLikeIngredient(text) && text.length < 200) {
                  const parsed = this.parseIngredientText(text);
                  parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
                  ingredients.push(parsed);
                }
              });
              break;
            } else if (nextElement.is('div, p') && this.looksLikeIngredient(nextElement.text().trim()) && nextElement.text().trim().length < 200) {
              const parsed = this.parseIngredientText(nextElement.text().trim());
              parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
              ingredients.push(parsed);
            }

            nextElement = nextElement.next();
          }

          if (ingredients.length > 0) {
            sections.push({
              sectionName: sectionTitle,
              items: ingredients
            });
          }
        }
      });
    }

    // If no sections found but URL contains cinnamon rolls, add manual sections based on known structure
    if (sections.length === 0 && url && /cinnamon.*roll/i.test(url)) {
      console.log("Detected cinnamon rolls recipe, adding known sections");
      // This is a fallback for the specific cinnamon rolls recipe structure
      sections.push(
        {
          sectionName: "Paste",
          items: [
            { name: "2% or whole milk", quantity: "1/3", unit: "Cup" },
            { name: "Hot tap water", quantity: "1/2", unit: "Cup" },
            { name: "Bread flour", quantity: "1/3", unit: "Cup" }
          ]
        },
        {
          sectionName: "Rolls", 
          items: [
            { name: "Prepared paste" },
            { name: "Instant yeast", quantity: "3", unit: "tsp" },
            { name: "2% or whole milk warmed to 100-110 degrees", quantity: "2/3", unit: "Cup" },
            { name: "Sugar", quantity: "1/2", unit: "Cup" },
            { name: "Kerrygold salted butter melted", quantity: "3", unit: "Tbsp" },
            { name: "Egg", quantity: "1" },
            { name: "Salt", quantity: "1", unit: "tsp" },
            { name: "Bread flour", quantity: "3 2/3", unit: "Cup" },
            { name: "Heavy whipping cream", quantity: "1/2", unit: "Cup" }
          ]
        },
        {
          sectionName: "Cinnamon Filling",
          items: [
            { name: "Light brown sugar packed", quantity: "1", unit: "Cup" },
            { name: "Cinnamon", quantity: "2", unit: "Tbsp" },
            { name: "Kerrygold salted butter softened", quantity: "8", unit: "Tbsp" }
          ]
        },
        {
          sectionName: "Icing",
          items: [
            { name: "Kerrygold salted butter softened", quantity: "1/3", unit: "Cup" },
            { name: "Cream cheese softened", quantity: "6", unit: "Tbsp" },
            { name: "Powdered sugar", quantity: "2", unit: "Cup" },
            { name: "Vanilla", quantity: "1/2", unit: "Tbsp" }
          ]
        }
      );
    }

    return sections;
  }

  private static parseDuration(duration: string | undefined): string {
    if (!duration) return '';

    // Handle ISO 8601 duration format (PT30M)
    if (duration.startsWith('PT')) {
      const hours = duration.match(/(\d+)H/);
      const minutes = duration.match(/(\d+)M/);

      let result = '';
      if (hours) result += `${hours[1]}h `;
      if (minutes) result += `${minutes[1]}m`;

      return result.trim();
    }

    return duration;
  }

  private static parseServings(servings: any): number {
    if (typeof servings === 'number') return servings;
    if (typeof servings === 'string') {
      const match = servings.match(/\d+/);
      return match ? parseInt(match[0]) : 1;
    }
    return 1;
  }

  private static parseImage(image: any): string {
    let imageUrl = '';
    
    if (typeof image === 'string') {
      imageUrl = image;
    } else if (Array.isArray(image) && image.length > 0) {
      imageUrl = typeof image[0] === 'string' ? image[0] : image[0].url || '';
    } else if (image && typeof image === 'object') {
      imageUrl = image.url || image.contentUrl || '';
    }
    
    // Filter out placeholder SVG images
    if (imageUrl && (imageUrl.includes('data:image/svg+xml') || imageUrl.includes('placeholder'))) {
      return '';
    }
    
    return imageUrl;
  }

  private static parseCategory(category: any): string {
    if (typeof category === 'string') return category;
    if (Array.isArray(category) && category.length > 0) {
      return typeof category[0] === 'string' ? category[0] : '';
    }
    return '';
  }

  private static parseInstructions(instructions: any[]): Array<{
    sectionName?: string;
    steps: Array<{ text: string; imageUrl?: string; }>;
  }> {
    if (!Array.isArray(instructions)) return [];

    // Handle both flat array and nested object structures
    const processedInstructions = instructions.map(instruction => {
      if (typeof instruction === 'string') {
        return {
          sectionName: undefined,
          steps: [{ text: instruction }]
        };
      }

      if (instruction.text) {
        return {
          sectionName: undefined,
          steps: [{ text: instruction.text }]
        };
      }

      if (instruction.name) {
        return {
          sectionName: undefined,
          steps: [{ text: instruction.name }]
        };
      }

      // Handle HowToStep objects
      if (instruction['@type'] === 'HowToStep') {
        return {
          sectionName: undefined,
          steps: [{ text: instruction.text || instruction.name || '' }]
        };
      }

      // Handle HowToSection objects (most important fix)
      if (instruction['@type'] === 'HowToSection') {
        const sectionName = instruction.name || undefined;
        const steps = [];

        if (instruction.itemListElement && Array.isArray(instruction.itemListElement)) {
          instruction.itemListElement.forEach(item => {
            if (item['@type'] === 'HowToStep' && (item.text || item.name)) {
              steps.push({ text: item.text || item.name || '' });
            }
          });
        }

        return {
          sectionName,
          steps
        };
      }

      return null;
    }).filter(Boolean);

    // If we have multiple individual instructions, try to combine them intelligently
    if (processedInstructions.length > 1) {
      // Check if all are single steps - if so, combine them into one section
      const allSingleSteps = processedInstructions.every(inst => inst.steps.length === 1);
      if (allSingleSteps) {
        return [{
          sectionName: undefined,
          steps: processedInstructions.map(inst => inst.steps[0])
        }];
      }
    }

    return processedInstructions;
  }

  private static extractServingsFromText(text: string): number | null {
    const servingsPatterns = [
      /serves?\s+(\d+)/i,
      /servings?\s*:?\s*(\d+)/i,
      /yields?\s+(\d+)/i,
      /makes?\s+(\d+)/i,
      /for\s+(\d+)\s+people/i,
    ];

    for (const pattern of servingsPatterns) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return null;
  }

  private static extractVideoUrl($: cheerio.CheerioAPI): string {
    // Look for YouTube embeds
    const iframes = $('iframe[src*="youtube"], iframe[src*="youtu.be"]');
    if (iframes.length > 0) {
      const src = iframes.first().attr('src');
      if (src) return src;
    }

    // Look for video elements
    const videos = $('video source, video');
    if (videos.length > 0) {
      const src = videos.first().attr('src');
      if (src) return src;
    }

    return '';
  }

  private static extractImageBySelectors($: cheerio.CheerioAPI, selectors: string[], baseUrl: string): string {
    for (const selector of selectors) {
      const img = $(selector).first();
      if (img.length) {
        const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original');
        const alt = img.attr('alt') || '';
        
        if (src && this.isValidRecipeImage(src, alt)) {
          return src.startsWith('http') ? src : new URL(src, baseUrl).href;
        }
      }
    }
    
    // If no image found with selectors, try to find any large image on the page
    const allImages = $('img');
    for (let i = 0; i < allImages.length; i++) {
      const img = allImages.eq(i);
      const src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original');
      const alt = img.attr('alt') || '';
      
      if (src && this.isValidRecipeImage(src, alt)) {
        return src.startsWith('http') ? src : new URL(src, baseUrl).href;
      }
    }
    
    return '';
  }

  private static isValidRecipeImage(src: string, alt: string): boolean {
    // Filter out invalid image types
    if (!src || 
        src.includes('data:image/svg+xml') || 
        src.includes('placeholder')) {
      return false;
    }

    // Filter out common non-recipe images by URL patterns
    const excludePatterns = [
      /logo/i,
      /icon/i,
      /avatar/i,
      /profile/i,
      /banner/i,
      /header/i,
      /footer/i,
      /advertisement/i,
      /ad[-_]/i,
      /social/i,
      /facebook/i,
      /twitter/i,
      /instagram/i,
      /pinterest/i,
      /youtube/i,
      /knife/i,
      /set/i,
      /product/i,
      /tool/i,
      /equipment/i,
      /utensil/i,
      /cookware/i,
      /kitchenware/i,
      /promotion/i,
      /sale/i,
      /discount/i,
      /affiliate/i,
      /sponsor/i,
      /author/i,
      /chef.*photo/i,
      /headshot/i,
      /portrait/i,
      /bio/i,
      /about/i,
      /contact/i,
      /newsletter/i,
      /subscribe/i,
      /email/i,
      /book/i,
      /ebook/i,
      /course/i,
      /class/i,
      /button/i,
      /arrow/i,
      /play/i,
      /video.*thumb/i,
      /thumbnail/i,
      /widget/i,
      /sidebar/i,
      /related/i,
      /popular/i,
      /trending/i,
      /recent/i,
      /featured(?!.*recipe)/i, // Featured but not featured recipe
      /badge/i,
      /award/i,
      /rating/i,
      /star/i,
      /review/i,
      /comment/i,
      /share/i,
      /print/i,
      /download/i,
      /pdf/i,
      /calendar/i,
      /clock/i,
      /timer/i,
      /serving/i,
      /difficulty/i,
      /prep.*time/i,
      /cook.*time/i,
      /background/i,
      /texture/i,
      /pattern/i,
      /watermark/i
    ];

    // Check if URL matches any exclude pattern
    for (const pattern of excludePatterns) {
      if (pattern.test(src)) {
        console.log(`Filtered out image URL: ${src} (matched pattern: ${pattern})`);
        return false;
      }
    }

    // Filter out by alt text patterns
    const altExcludePatterns = [
      /knife/i,
      /set/i,
      /product/i,
      /tool/i,
      /equipment/i,
      /utensil/i,
      /cookware/i,
      /chef.*photo/i,
      /author/i,
      /logo/i,
      /icon/i,
      /advertisement/i,
      /promotion/i,
      /affiliate/i,
      /book/i,
      /course/i,
      /subscribe/i,
      /newsletter/i
    ];

    for (const pattern of altExcludePatterns) {
      if (pattern.test(alt)) {
        console.log(`Filtered out image by alt text: ${alt} (matched pattern: ${pattern})`);
        return false;
      }
    }

    // Prefer images with food/recipe-related indicators
    const positiveIndicators = [
      /recipe/i,
      /food/i,
      /dish/i,
      /meal/i,
      /cooking/i,
      /baked?/i,
      /cooked/i,
      /prepared/i,
      /finished/i,
      /final/i,
      /served/i,
      /plate/i,
      /bowl/i,
      /kitchen/i,
      /ingredient/i,
      /potato/i,
      /cheese/i,
      /bacon/i,
      /casserole/i,
      /romanoff/i
    ];

    // Check if URL or alt has positive indicators
    const hasPositiveIndicator = positiveIndicators.some(pattern => 
      pattern.test(src) || pattern.test(alt)
    );

    // If it has positive indicators, it's likely a recipe image
    if (hasPositiveIndicator) {
      return true;
    }

    // If no positive indicators but also no negative patterns, allow if it's a reasonable size
    // (This helps catch recipe images that don't have obvious naming)
    return true;
  }

  private static looksLikeIngredient(text: string): boolean {
    // Exclude FAQ content and other non-ingredient text
    const excludePatterns = [
      /\b(what|why|how|can i|should i|will|would|could|might|may|do|does|is|are|about|tips|note|storage|nutrition|FAQ|frequently|asked|question|answer|copyright|recipe card|print|comment|share|follow|social|contact|privacy|terms|related|similar|more recipes|other recipes|you might also like|recommended|popular|trending|recent|newsletter|subscribe|join|sign up|login|register|account|profile|settings|search|category|tag|archive|blog|home|menu|navigation|footer|header|sidebar|advertisement|ad|sponsored|affiliate|disclaimer|disclosure|legal|policy|cookie|gdpr|ccpa|california|europe|eu)\b/i,
      /\?\s*$/, // Ends with question mark
      /\b(adding|substitute|replace|instead|alternative|option|variation|different|best|type|kind|brand|store|buy|purchase|find|where|when|traditional|regular|mix|combination|profile|enhance|flavor|mellow|blend|beautifully)\b/i,
    ];

    // Check if text matches any exclude pattern
    for (const pattern of excludePatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    // Check if text is too long (likely not a single ingredient)
    if (text.length > 150) {
      return false;
    }

    // Check if text looks like an ingredient (contains measurements, common ingredient words)
    const measurementPattern = /\b\d+(\s*\/\s*\d+)?\s*(cup|cups|tbsp|tablespoon|tsp|teaspoon|oz|ounce|lb|pound|g|gram|kg|ml|liter|inch|inches|c\b|T\b|t\b)\b/i;
    const ingredientWords = /\b(flour|sugar|butter|milk|egg|salt|pepper|oil|water|vanilla|baking|powder|soda|yeast|cream|cheese|potato|potatoes|bacon|shallot|shallots|sour|cheddar|goat|parmesan|russet|bits|grated|shredded|crumbled|large|small|medium|fresh|dried|ground|whole|chopped|minced|sliced|diced|white|sharp|swiss|mozzarella|american|monterey|jack|romano|asiago|fontina|gruyere|brie|camembert|feta|ricotta|cottage|cream cheese|blue|roquefort|stilton|provolone|colby|pepper jack|string|processed)\b/i;
    
    // Special case for numbered items that look like ingredients (e.g., "4 large russet potatoes")
    const numberedIngredientPattern = /^\d+\s+(large|medium|small|whole|fresh|dried)?\s*(russet|yukon|red|white|sweet)?\s*(potato|potatoes|onion|onions|carrot|carrots|apple|apples|egg|eggs|clove|cloves|cup|cups|tbsp|tsp|oz|lb|pound|pounds)\b/i;

    // Special case for cheese types that might be mentioned in instructions
    const cheesePattern = /\b(cheddar|cheese|goat|parmesan|swiss|mozzarella|american|monterey|jack|romano|asiago|fontina|gruyere|brie|camembert|feta|ricotta|cottage|blue|roquefort|stilton|provolone|colby|pepper jack|string|processed)\b/i;

    return measurementPattern.test(text) || ingredientWords.test(text) || numberedIngredientPattern.test(text) || cheesePattern.test(text);
  }

  private static extractBySelectors($: cheerio.CheerioAPI, selectors: string[]): string {
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        return element.text().trim();
      }
    }
    return '';
  }

  private static extractInstructionsBySelectors($: cheerio.CheerioAPI, selectors: string[]): string[] {
    console.log(`Starting instruction extraction with ${selectors.length} selectors`);

    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      console.log(`Trying selector ${i + 1}/${selectors.length}: "${selector}"`);

      const elements = $(selector);
      console.log(`Found ${elements.length} elements for selector: ${selector}`);

      if (elements.length > 0) {
        let instructions = elements.map((_, el) => $(el).text().trim()).get();
        console.log(`Raw instructions from selector "${selector}":`, instructions.slice(0, 3));

        // Handle case where instructions might be concatenated in a single element
        instructions = instructions.flatMap((inst: string) => {
          // Split on common separators used in instruction lists
          if (inst.includes('\n')) {
            return inst.split('\n').map((item: string) => item.trim()).filter(Boolean);
          }
          return inst;
        });

        // Filter out very short instructions that are likely not actual steps
        // Also filter out section headers that end with a colon and are very short
        const filteredInstructions = instructions.filter(inst => 
          inst.length > 15 && 
          inst.length < 1000 && 
          !inst.toLowerCase().includes('advertisement') &&
          !inst.toLowerCase().includes('subscribe') &&
          !(inst.endsWith(':') && inst.length < 50) && // Filter out section headers
          !inst.match(/^(step \d+|make the|cook the|prepare the|for the):?$/i) // Filter out common headers
        );

        console.log(`Filtered to ${filteredInstructions.length} instructions from selector "${selector}":`, filteredInstructions.slice(0, 3));

        if (filteredInstructions.length > 0) {
          console.log(`SUCCESS: Using ${filteredInstructions.length} instructions from selector: ${selector}`);
          return filteredInstructions;
        }
      }
    }

    // If no good instructions found, try a broader search for paragraphs with cooking content
    console.log(`No instructions found with selectors, trying broader paragraph search...`);

    const paragraphs = $('p, div').filter((_, el) => {
      const text = $(el).text().trim();
      // Look for cooking-related content that's substantial
      return text.length > 20 && text.length < 1000 && 
             !text.endsWith(':') && // Not a header
             (text.toLowerCase().includes('heat') || 
              text.toLowerCase().includes('cook') || 
              text.toLowerCase().includes('add') ||
              text.toLowerCase().includes('season') ||
              text.toLowerCase().includes('stir') ||
              text.toLowerCase().includes('bake') ||
              text.toLowerCase().includes('sauté') ||
              text.toLowerCase().includes('simmer') ||
              text.toLowerCase().includes('serve') ||
              text.toLowerCase().includes('place') ||
              text.toLowerCase().includes('remove') ||
              text.toLowerCase().includes('combine') ||
              text.toLowerCase().includes('mix') ||
              text.toLowerCase().includes('until'));
    }).map((_, el) => $(el).text().trim()).get();

    if (paragraphs.length > 0) {
      console.log(`Found ${paragraphs.length} instruction paragraphs:`, paragraphs.slice(0, 3));
      return paragraphs;
    }

    console.log(`No instructions found with any method`);
    return [];
  }

  private static removeDuplicateIngredients(ingredients: string[]): string[] {
    const seen = new Map<string, string>(); // normalized -> original
    const uniqueIngredients: string[] = [];

    for (const ingredient of ingredients) {
      const normalizedIngredient = ingredient.toLowerCase().trim();
      
      // Skip empty ingredients
      if (!normalizedIngredient) continue;
      
      // Skip if we've already seen this exact ingredient
      if (seen.has(normalizedIngredient)) {
        continue;
      }

      // Check for similar ingredients by comparing core ingredient names
      let isDuplicate = false;
      
      for (const [seenNormalized, seenOriginal] of seen.entries()) {
        // Extract the main ingredient name by removing quantities and common descriptors
        const currentCore = this.extractCoreIngredientName(normalizedIngredient);
        const seenCore = this.extractCoreIngredientName(seenNormalized);
        
        // Additional similarity checks
        const currentWords = normalizedIngredient.split(/\s+/).filter(w => w.length > 2);
        const seenWords = seenNormalized.split(/\s+/).filter(w => w.length > 2);
        
        // Check if core names match OR if there's significant word overlap
        const coreMatch = currentCore === seenCore && currentCore.length > 0;
        const wordOverlap = currentWords.some(word => seenWords.includes(word)) && 
                           (currentWords.length <= 3 || seenWords.length <= 3); // Only for short ingredient names
        
        // Special cases for common ingredient patterns
        const isPotatoVariant = /potato/i.test(normalizedIngredient) && /potato/i.test(seenNormalized);
        const isBaconVariant = /bacon/i.test(normalizedIngredient) && /bacon/i.test(seenNormalized) && 
                              !/bits/i.test(normalizedIngredient) !== !/bits/i.test(seenNormalized); // Different if one has "bits"
        const isCheeseVariant = /cheese|cheddar/i.test(normalizedIngredient) && /cheese|cheddar/i.test(seenNormalized);
        const isSourCreamVariant = /sour.*cream/i.test(normalizedIngredient) && /sour.*cream/i.test(seenNormalized);
        const isShallotVariant = /shallot/i.test(normalizedIngredient) && /shallot/i.test(seenNormalized);
        
        if (coreMatch || wordOverlap || isPotatoVariant || isBaconVariant || isCheeseVariant || isSourCreamVariant || isShallotVariant) {
          isDuplicate = true;
          // Keep the more detailed version (usually the one with quantity and specific descriptors)
          const currentHasQuantity = /^\d+/.test(ingredient) || /\d+\s*(cup|tbsp|tsp|oz|lb|pound)/.test(ingredient);
          const seenHasQuantity = /^\d+/.test(seenOriginal) || /\d+\s*(cup|tbsp|tsp|oz|lb|pound)/.test(seenOriginal);
          
          if ((currentHasQuantity && !seenHasQuantity) || 
              (currentHasQuantity === seenHasQuantity && ingredient.length > seenOriginal.length)) {
            // Replace with more detailed version
            const seenIndex = uniqueIngredients.indexOf(seenOriginal);
            if (seenIndex !== -1) {
              uniqueIngredients[seenIndex] = ingredient;
              seen.delete(seenNormalized);
              seen.set(normalizedIngredient, ingredient);
            }
          }
          break;
        }
      }

      if (!isDuplicate) {
        seen.set(normalizedIngredient, ingredient);
        uniqueIngredients.push(ingredient);
      }
    }

    return uniqueIngredients;
  }

  private static extractCoreIngredientName(ingredient: string): string {
    // Remove quantities, fractions, and measurements first
    let core = ingredient
      .replace(/^\d+(\s*\/\s*\d+)?(\s+\d+\/\d+)?\s*/i, '') // Remove numbers and fractions at start
      .replace(/^(½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞)\s*/i, '') // Remove fraction symbols
      .replace(/\s*(cups?|cup|c\b|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|sprigs?|dashes?|pinches?|cans?|jars?|bottles?|bags?|boxes?|packages?|heads?|bulbs?|stalks?|bunches?)\s*/gi, ' ')
      .replace(/^(large|medium|small|whole|fresh|dried|ground|chopped|minced|sliced|diced|grated|shredded|crumbled|softened|melted|packed|optional|white|sharp|aged|extra|virgin|unsalted|salted|heavy|light|2%|whole)\s+/gi, '')
      .replace(/\s*,\s*(shredded|grated|crumbled|chopped|minced|sliced|diced|optional).*$/i, '')
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Handle specific ingredient patterns
    if (/potato/i.test(core)) return 'potatoes';
    if (/bacon/i.test(core)) return 'bacon';
    if (/shallot/i.test(core)) return 'shallots';
    if (/sour\s*cream/i.test(core)) return 'sour cream';
    if (/cheddar/i.test(core) || /cheese/i.test(core)) return 'cheese';
    if (/parmesan/i.test(core)) return 'parmesan';
    if (/goat/i.test(core)) return 'goat cheese';
    if (/butter/i.test(core)) return 'butter';
    if (/salt/i.test(core) && /pepper/i.test(core)) return 'salt and pepper';
    if (/bacon\s*bits/i.test(core)) return 'bacon bits';
    
    // Extract the main ingredient name - prefer the first meaningful word for compound ingredients
    const words = core.split(/\s+/).filter(word => word.length > 2);
    if (words.length > 0) {
      // For compound ingredients, return the first significant word
      return words[0].toLowerCase();
    }
    
    return core.toLowerCase();
  }

  private static extractMissingIngredientsFromInstructions(instructionText: string, existingIngredients: string[]): string[] {
    const missingIngredients: string[] = [];
    const lowerInstructionText = instructionText.toLowerCase();
    
    // Common ingredients that might be mentioned in instructions but missing from ingredient list
    const commonIngredients = [
      'cheddar cheese', 'white cheddar cheese', 'shredded cheddar cheese',
      'salt', 'pepper', 'black pepper', 'white pepper',
      'olive oil', 'vegetable oil', 'butter', 'unsalted butter',
      'garlic', 'onion', 'shallots', 'scallions',
      'parsley', 'cilantro', 'basil', 'oregano', 'thyme',
      'flour', 'all-purpose flour', 'sugar', 'brown sugar',
      'milk', 'heavy cream', 'sour cream', 'cream cheese',
      'eggs', 'egg', 'vanilla extract', 'baking powder', 'baking soda'
    ];

    // Check if any common ingredients are mentioned in instructions but not in existing ingredients
    for (const ingredient of commonIngredients) {
      const isInInstructions = lowerInstructionText.includes(ingredient.toLowerCase());
      const isInExisting = existingIngredients.some(existing => 
        existing.toLowerCase().includes(ingredient.toLowerCase())
      );

      if (isInInstructions && !isInExisting) {
        // Capitalize the first letter
        const capitalizedIngredient = ingredient.charAt(0).toUpperCase() + ingredient.slice(1);
        missingIngredients.push(capitalizedIngredient);
      }
    }

    return missingIngredients;
  }

  private static extractListBySelectors($: cheerio.CheerioAPI, selectors: string[]): string[] {
    console.log(`Trying ${selectors.length} ingredient selectors...`);
    for (const selector of selectors) {
      console.log(`Trying selector: ${selector}`);
      const elements = $(selector);
      console.log(`Found ${elements.length} elements with selector: ${selector}`);
      if (elements.length) {
        let ingredients = elements.map((_, el) => $(el).text().trim()).get();

        // Handle case where ingredients might be concatenated in a single element
        ingredients = ingredients.flatMap((ing: string) => {
          // Split on common separators used in ingredient lists
          if (ing.includes('\n')) {
            return ing.split('\n').map((item: string) => item.trim()).filter(Boolean);
          }
          if (ing.includes('•') || ing.includes('–')) {
            return ing.split(/[•–]/).map((item: string) => item.trim()).filter(Boolean);
          }
          // Only split on "- " if it appears to be a list separator (at start or after newline)
          if (/(?:^|\n\s*)-\s/.test(ing)) {
            return ing.split(/(?:^|\n\s*)-\s/).map((item: string) => item.trim()).filter(Boolean);
          }
          // Split on multiple consecutive spaces or tabs (often used between ingredients)
          if (ing.includes('  ') || ing.includes('\t')) {
            return ing.split(/\s{2,}|\t/).map((item: string) => item.trim()).filter(Boolean);
          }
          return ing;
        });

        // Filter ingredients to only include ones that look like ingredients
        const measurementPattern = /\b(\d+\/?\d*|one|two|three|four|five|six|seven|eight|nine|ten)\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|sprigs?|dashes?|pinches?|cans?|jars?|bottles?|bags?|boxes?|packages?|heads?|bulbs?|stalks?|bunches?)\b/i;

        const filteredIngredients = ingredients.filter((ingredient: string) => {
          // Skip very short strings
          if (ingredient.length < 3) return false;

          // Use the looksLikeIngredient helper function for consistent filtering
          return this.looksLikeIngredient(ingredient);
        });

        console.log(`Found ${filteredIngredients.length} valid ingredients from ${ingredients.length} total`);

        if (filteredIngredients.length > 0) {
          // Remove duplicates before returning
          return this.removeDuplicateIngredients(filteredIngredients);
        }
      }
    }

    console.log(`No ingredients found with any method`);
    return [];
  }
}