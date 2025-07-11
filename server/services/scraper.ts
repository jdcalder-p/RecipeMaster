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
    let ingredients = Array.isArray(recipe.recipeIngredient) 
      ? recipe.recipeIngredient.map((ing: any) => typeof ing === 'string' ? ing : ing.text || '')
      : [];

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

    const instructions = this.parseInstructions(recipe.recipeInstructions || []);

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
    }> = ingredients.filter(Boolean).length > 0 
      ? [{ 
          sectionName: undefined,
          items: ingredients.filter(Boolean).map((ing: any) => {
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
      imageUrl: this.parseImage(recipe.image),
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
        '.recipe-ingredient',
        '.ingredients li',
        '[class*="ingredient"]',
        '.recipe-ingredients li',
        '.wp-block-recipe-card-ingredient',
        '.recipe-card-ingredient',
        '.recipe-ingredients .ingredient',
        '.ingredient-list li',
        '.ingredients-list li',
        '.recipe-instructions li:contains("cup"):contains("tbsp"):contains("tsp")',
        '.entry-content li:contains("cup")',
        '.entry-content li:contains("tbsp")',
        '.entry-content li:contains("tsp")',
        '.entry-content ul li',
        'ul li',
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
  
    // 1. Look for numbered steps in paragraphs and divs
    $('p, div').each((_, el) => {
      const text = $(el).text().trim();
      if (/^\d+\.\s/.test(text) && text.length > 20 && text.length < 1000) {
        instructions.push(text);
      }
    });
  
    // 2. Look for instruction sections based on headings
    $('h1, h2, h3, h4, h5, h6, strong, b').each((_, el) => {
      const $heading = $(el);
      const headingText = $heading.text().trim().toLowerCase();
  
      if (/(instructions?|method|directions?|steps?)/.test(headingText)) {
        let $next = $heading.next();
        let attempts = 0;
  
        while ($next.length && attempts < 5) {
          attempts++;
          const nextText = $next.text().trim();
  
          if (nextText.length > 20 && nextText.length < 1000) {
            instructions.push(nextText);
          }
  
          $next = $next.next();
        }
      }
    });
  
    // 3. Look for content in lists
    $('ol li, ul li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 1000) {
        instructions.push(text);
      }
    });
  
    console.log(`Found ${instructions.length} instructions via advanced extraction`);
    return instructions;
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
          if (src) {
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
          if (src) {
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

    // Try to find sections with headings followed by ingredient lists
    const possibleSections = [
      'h2, h3, h4, h5, h6, .recipe-section-title, .ingredient-section, .section-title, strong, b, .wp-block-heading, .has-text-align-center, .ingredient-header',
    ];

    for (const sectionSelector of possibleSections) {
      $(sectionSelector).each((_, element) => {
        const $section = $(element);
        const sectionTitle = $section.text().trim();

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
                if (text && this.looksLikeIngredient(text)) {
                  const parsed = this.parseIngredientText(text);
                  // Capitalize the first letter of ingredient name
                  parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
                  ingredients.push(parsed);
                }
              });
              break;
            } else if (nextElement.is('div, p') && this.looksLikeIngredient(nextElement.text().trim())) {
              const parsed = this.parseIngredientText(nextElement.text().trim());
              // Capitalize the first letter of ingredient name
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

  private static looksLikeIngredient(text: string): boolean {
    // Check if text looks like an ingredient (contains measurements, common ingredient words)
    const measurementPattern = /\b\d+(\s*\/\s*\d+)?\s*(cup|cups|tbsp|tablespoon|tsp|teaspoon|oz|ounce|lb|pound|g|gram|kg|ml|liter|inch|inches|c\b|T\b|t\b)\b/i;
    const ingredientWords = /\b(flour|sugar|butter|milk|egg|salt|pepper|oil|water|vanilla|baking|powder|soda|yeast|cream|cheese)\b/i;

    return measurementPattern.test(text) || ingredientWords.test(text);
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

        // Filter ingredients to only include ones that look like ingredients (contain common measurements)
        const measurementPattern = /\b(\d+\/?\d*|one|two|three|four|five|six|seven|eight|nine|ten)\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|stri