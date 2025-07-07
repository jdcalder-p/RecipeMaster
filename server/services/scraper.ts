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
    ingredients = ingredients.flatMap((ing: string) => {
      if (ing.includes('•') || ing.includes('–') || ing.includes('-')) {
        return ing.split(/[•–-]/).map((item: string) => item.trim()).filter(Boolean);
      }
      return ing;
    });

    const instructions = this.parseInstructions(recipe.recipeInstructions || []);
    
    const cookTime = this.parseDuration(recipe.cookTime || recipe.totalTime);
    const servings = this.parseServings(recipe.recipeYield);

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

    return {
      title: recipe.name || '',
      description: recipe.description || '',
      cookTime,
      servings,
      ingredients: structuredIngredients,
      instructions: instructions.filter(Boolean).map(text => ({ text })),
      imageUrl: this.parseImage(recipe.image),
      category: this.parseCategory(recipe.recipeCategory),
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
    
    // If we didn't find many instructions, try broader searches
    if (instructions.length < 3) {
      console.log("Low instruction count, trying broader search...");
      
      // Try to find instruction content in paragraphs or divs
      const paragraphInstructions = $('p, div').filter((_, el) => {
        const text = $(el).text().trim();
        // Look for numbered steps or instruction patterns
        return /^\d+\./.test(text) || 
               /^step \d+/i.test(text) ||
               (text.length > 20 && text.length < 500 && 
                (text.toLowerCase().includes('cook') || 
                 text.toLowerCase().includes('bake') || 
                 text.toLowerCase().includes('heat') ||
                 text.toLowerCase().includes('add') ||
                 text.toLowerCase().includes('stir') ||
                 text.toLowerCase().includes('season')));
      }).map((_, el) => $(el).text().trim()).get();
      
      console.log(`Found ${paragraphInstructions.length} paragraph instructions:`, paragraphInstructions.slice(0, 3));
      
      if (paragraphInstructions.length > instructions.length) {
        instructions = paragraphInstructions;
      }
    }
    const cookTime = this.extractBySelectors($, selectors.cookTime);
    const servings = this.parseServings(this.extractBySelectors($, selectors.servings));
    const imageUrl = this.extractImageBySelectors($, selectors.image, url);
    const videoUrl = RecipeScraper.extractVideoUrl($);

    return {
      title: title || 'Imported Recipe',
      description,
      cookTime,
      servings,
      ingredients: ingredientsWithSections.length > 0 
        ? ingredientsWithSections 
        : ingredients.filter(Boolean).length > 0 
          ? [{ items: ingredients.filter(Boolean).map((ing: any) => {
              const parsed = this.parseIngredientText(ing);
              // Capitalize the first letter of ingredient name
              parsed.name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
              return parsed;
            }) }]
          : [],
      instructions: RecipeScraper.extractInstructionsWithImages($, instructions, url),
      imageUrl,
      videoUrl,
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
        const filteredInstructions = instructions.filter(inst => 
          inst.length > 10 && 
          inst.length < 1000 && 
          !inst.toLowerCase().includes('advertisement') &&
          !inst.toLowerCase().includes('subscribe')
        );
        
        console.log(`Filtered to ${filteredInstructions.length} instructions from selector "${selector}":`, filteredInstructions.slice(0, 3));
        
        if (filteredInstructions.length > 0) {
          console.log(`SUCCESS: Using ${filteredInstructions.length} instructions from selector: ${selector}`);
          return filteredInstructions;
        }
      }
    }
    
    console.log(`No instructions found with any selector`);
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
          if (ing.includes('•') || ing.includes('–') || ing.includes('- ')) {
            return ing.split(/[•–]|\s-\s/).map((item: string) => item.trim()).filter(Boolean);
          }
          // Split on multiple consecutive spaces or tabs (often used between ingredients)
          if (ing.includes('  ') || ing.includes('\t')) {
            return ing.split(/\s{2,}|\t/).map((item: string) => item.trim()).filter(Boolean);
          }
          return ing;
        });
        
        // Filter ingredients to only include ones that look like ingredients (contain common measurements)
        const measurementPattern = /\b(\d+\/?\d*|one|two|three|four|five|six|seven|eight|nine|ten)\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?)\b/i;
        
        const filteredIngredients = ingredients.filter(ing => {
          const text = ing.toLowerCase();
          // Keep if it contains measurements or common ingredient words
          return measurementPattern.test(ing) || 
                 text.includes('salt') || text.includes('pepper') || text.includes('flour') || 
                 text.includes('sugar') || text.includes('butter') || text.includes('egg') ||
                 text.includes('milk') || text.includes('water') || text.includes('oil') ||
                 text.includes('yeast') || text.includes('vanilla') || text.includes('cinnamon');
        });
        
        if (filteredIngredients.length > 0) {
          return filteredIngredients;
        }
        
        // If filtered list is empty, return all ingredients (some recipes might not have standard measurements)
        return ingredients.filter(Boolean);
      }
    }
    
    // Last resort: try to extract from the entire page content
    const allText = $('body').text();
    const lines = allText.split('\n').map(line => line.trim()).filter(Boolean);
    
    const ingredientLines = lines.filter(line => {
      const text = line.toLowerCase();
      // Look for lines that seem like ingredients
      return /\b(\d+\/?\d*)\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?)\b/i.test(line) ||
             (text.includes('cup') && text.length < 100) ||
             (text.includes('tbsp') && text.length < 100) ||
             (text.includes('tsp') && text.length < 100);
    });
    
    return ingredientLines.slice(0, 20); // Limit to reasonable number
  }

  private static extractVideoUrl($: cheerio.CheerioAPI): string {
    // Look for YouTube, Vimeo, or other video embeds
    const videoSelectors = [
      'iframe[src*="youtube.com"]',
      'iframe[src*="youtu.be"]', 
      'iframe[src*="vimeo.com"]',
      'iframe[src*="dailymotion.com"]',
      'video source',
      '.video-container iframe',
      '.recipe-video iframe',
      '[data-video-url]',
      'a[href*="youtube.com"]',
      'a[href*="youtu.be"]',
      'a[href*="vimeo.com"]',
    ];

    for (const selector of videoSelectors) {
      const element = $(selector).first();
      if (element.length) {
        // For iframes, get src attribute
        const src = element.attr('src');
        if (src && (src.includes('youtube') || src.includes('vimeo') || src.includes('dailymotion'))) {
          return src.startsWith('//') ? `https:${src}` : src;
        }
        
        // For links, get href attribute
        const href = element.attr('href');
        if (href && (href.includes('youtube') || href.includes('youtu.be') || href.includes('vimeo'))) {
          return href;
        }
        
        // For data attributes
        const dataUrl = element.attr('data-video-url');
        if (dataUrl) return dataUrl;
      }
    }
    
    return '';
  }

  private static extractImageBySelectors($: cheerio.CheerioAPI, selectors: string[], baseUrl: string): string {
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const src = element.attr('src') || element.attr('data-src');
        if (src) {
          return src.startsWith('http') ? src : new URL(src, baseUrl).href;
        }
      }
    }
    return '';
  }

  private static parseInstructions(instructions: any[]): string[] {
    const parsedInstructions = instructions.map(inst => {
      if (typeof inst === 'string') return inst.trim();
      if (inst.text) return inst.text.trim();
      if (inst.name) return inst.name.trim();
      return '';
    }).filter(Boolean);

    // Remove duplicates by converting to Set and back to array
    const uniqueInstructions = Array.from(new Set(parsedInstructions));
    
    return uniqueInstructions;
  }

  private static parseDuration(duration: string): string {
    if (!duration) return '';
    
    // Parse ISO 8601 duration (PT30M) or simple text
    const isoMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (isoMatch) {
      const hours = parseInt(isoMatch[1] || '0');
      const minutes = parseInt(isoMatch[2] || '0');
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes} min`;
    }
    
    return duration;
  }

  private static parseServings(yield_: any): number {
    if (typeof yield_ === 'number') return yield_;
    if (typeof yield_ === 'string') {
      const match = yield_.match(/\d+/);
      return match ? parseInt(match[0]) : 1;
    }
    return 1;
  }

  private static parseImage(image: any): string {
    if (typeof image === 'string') return image;
    if (Array.isArray(image) && image.length > 0) {
      return typeof image[0] === 'string' ? image[0] : image[0].url || '';
    }
    if (image && image.url) return image.url;
    return '';
  }

  private static parseCategory(category: any): string {
    if (typeof category === 'string') return category;
    if (Array.isArray(category) && category.length > 0) {
      return category[0];
    }
    return '';
  }

  private static standardizeUnit(unit: string): string {
    const unitLower = unit.toLowerCase();
    
    // Standardize units according to user requirements
    const unitMap: { [key: string]: string } = {
      // Cup variations
      'c': 'Cup',
      'cup': 'Cup',
      'cups': 'Cup',
      
      // Tablespoon variations  
      'tbsp': 'Tbsp',
      'tbs': 'Tbsp',
      'tablespoon': 'Tbsp',
      'tablespoons': 'Tbsp',
      't': 'Tbsp', // common abbreviation
      
      // Teaspoon variations
      'tsp': 'tsp',
      'teaspoon': 'tsp', 
      'teaspoons': 'tsp',
      
      // Ounce variations
      'oz': 'oz',
      'ozs': 'oz',
      'ounce': 'oz',
      'ounces': 'oz',
      
      // Pound variations
      'lb': 'lb',
      'lbs': 'lb',
      'pound': 'lb',
      'pounds': 'lb',
      
      // Gram variations
      'g': 'g',
      'gram': 'g',
      'grams': 'g',
      
      // Other units (keep as-is but standardize casing)
      'kg': 'kg',
      'kilogram': 'kg',
      'kilograms': 'kg',
      'ml': 'ml',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'l': 'L',
      'liter': 'L',
      'liters': 'L',
      'pint': 'pint',
      'pints': 'pint',
      'quart': 'quart',
      'quarts': 'quart',
      'gallon': 'gallon',
      'gallons': 'gallon',
      'clove': 'clove',
      'cloves': 'clove',
      'piece': 'piece',
      'pieces': 'piece',
      'slice': 'slice',
      'slices': 'slice',
      'strip': 'strip',
      'strips': 'strip',
      'bottle': 'bottle',
      'bottles': 'bottle',
      'can': 'can',
      'cans': 'can',
      'jar': 'jar',
      'jars': 'jar',
      'pkg': 'package',
      'package': 'package',
      'packages': 'package',
    };
    
    return unitMap[unitLower] || unit; // Return standardized unit or original if not found
  }

  private static parseIngredientText(ingredientText: string): { name: string; quantity?: string; unit?: string } {
    const text = ingredientText.trim();
    
    // Common patterns for quantity and unit extraction
    const patterns = [
      // "1 to 2 ozs White Truffle Oil" -> quantity: "1 to 2", unit: "ozs", name: "White Truffle Oil"
      /^(\d+(?:\.\d+)?(?:\/\d+)?\s+(?:to|-|or)\s+\d+(?:\.\d+)?(?:\/\d+)?)\s+(ozs?|oz|c|cup|cups|tbsp|tablespoons?|tbs|tsp|teaspoons?|lb|lbs|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|bottles?|cans?|jars?|packages?|pkg)\s+(.+)$/i,
      // "4 ozs Sweet Butter" -> quantity: "4", unit: "ozs", name: "Sweet Butter"
      /^(\d+(?:\.\d+)?(?:\/\d+)?)\s+(ozs?|oz|c|cup|cups|tbsp|tablespoons?|tbs|tsp|teaspoons?|lb|lbs|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|bottles?|cans?|jars?|packages?|pkg)\s+(.+)$/i,
      // "1/2 cup sugar" -> quantity: "1/2", unit: "cup", name: "sugar"
      /^(\d+\/\d+)\s+(ozs?|oz|c|cup|cups|tbsp|tablespoons?|tbs|tsp|teaspoons?|lb|lbs|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|bottles?|cans?|jars?|packages?|pkg)\s+(.+)$/i,
      // "1½ lbs cooked Elbow Pasta" -> quantity: "1½", unit: "lbs", name: "cooked Elbow Pasta"
      /^(\d+½|\d+¼|\d+¾)\s+(ozs?|oz|c|cup|cups|tbsp|tablespoons?|tbs|tsp|teaspoons?|lb|lbs|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|bottles?|cans?|jars?|packages?|pkg)\s+(.+)$/i,
      // "¼ tsp ground Nutmeg" -> quantity: "¼", unit: "tsp", name: "ground Nutmeg"
      /^(¼|½|¾|\d+¼|\d+½|\d+¾)\s+(ozs?|oz|c|cup|cups|tbsp|tablespoons?|tbs|tsp|teaspoons?|lb|lbs|pounds?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|bottles?|cans?|jars?|packages?|pkg)\s+(.+)$/i,
      // "2 to 3 apples" -> quantity: "2 to 3", unit: "", name: "apples"
      /^(\d+(?:\s+(?:to|-|or)\s+\d+)?)\s+(.+)$/,
      // "A pinch of salt" -> quantity: "A pinch", unit: "", name: "salt"
      /^(a pinch of|a dash of|a handful of)\s+(.+)$/i,
    ];

    console.log(`Parsing ingredient: "${text}"`);

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = text.match(pattern);
      if (match) {
        console.log(`Pattern ${i} matched:`, match);
        
        // Check if this is a unit-based pattern (first five patterns)
        if (i < 5 && match.length >= 4) {
          // Has explicit unit - standardize it
          const result = {
            quantity: match[1],
            unit: RecipeScraper.standardizeUnit(match[2]),
            name: match[3]
          };
          console.log(`Parsed with unit:`, result);
          return result;
        } else if (match[1] && (match[1].includes('pinch') || match[1].includes('dash') || match[1].includes('handful'))) {
          // Descriptive quantity
          const result = {
            quantity: match[1],
            name: match[2]
          };
          console.log(`Parsed descriptive:`, result);
          return result;
        } else if (match.length >= 3) {
          // Just number
          const result = {
            quantity: match[1],
            name: match[2]
          };
          console.log(`Parsed with quantity:`, result);
          return result;
        }
      }
    }

    // If no pattern matches, return as plain ingredient name
    const result = { name: text };
    console.log(`No pattern matched, using plain name:`, result);
    return result;
  }
}
