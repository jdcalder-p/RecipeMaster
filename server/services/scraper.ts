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
      const jsonLd = this.extractJsonLd($);
      if (jsonLd) {
        return jsonLd;
      }

      // Fallback to manual extraction
      return this.extractManually($, url);
    } catch (error) {
      console.error('Error scraping recipe:', error);
      throw new Error('Failed to extract recipe from URL. Please check the URL and try again.');
    }
  }

  private static extractJsonLd($: cheerio.CheerioAPI): Partial<InsertRecipe> | null {
    const scripts = $('script[type="application/ld+json"]');
    
    for (let i = 0; i < scripts.length; i++) {
      try {
        const jsonText = $(scripts[i]).html();
        if (!jsonText) continue;
        
        const json = JSON.parse(jsonText);
        const recipe = Array.isArray(json) ? json.find(item => item['@type'] === 'Recipe') : 
                      json['@type'] === 'Recipe' ? json : null;
        
        if (recipe) {
          return this.parseJsonLdRecipe(recipe);
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  }

  private static parseJsonLdRecipe(recipe: any): Partial<InsertRecipe> {
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

    return {
      title: recipe.name || '',
      description: recipe.description || '',
      cookTime,
      servings,
      ingredients: ingredients.filter(Boolean).length > 0 
        ? [{ items: ingredients.filter(Boolean).map((ing: any) => this.parseIngredientText(ing)) }]
        : [],
      instructions: instructions.filter(Boolean),
      imageUrl: this.parseImage(recipe.image),
      category: this.parseCategory(recipe.recipeCategory),
    };
  }

  private static extractManually($: cheerio.CheerioAPI, url: string): Partial<InsertRecipe> {
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
        '.recipe-instruction',
        '.instructions li',
        '[class*="instruction"]',
        '.recipe-instructions li',
        '.recipe-directions li',
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
    const instructions = this.extractListBySelectors($, selectors.instructions);
    const cookTime = this.extractBySelectors($, selectors.cookTime);
    const servings = this.parseServings(this.extractBySelectors($, selectors.servings));
    const imageUrl = this.extractImageBySelectors($, selectors.image, url);

    return {
      title: title || 'Imported Recipe',
      description,
      cookTime,
      servings,
      ingredients: ingredients.filter(Boolean).length > 0 
        ? [{ items: ingredients.filter(Boolean).map((ing: any) => this.parseIngredientText(ing)) }]
        : [],
      instructions: instructions.filter(Boolean),
      imageUrl,
    };
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
    return instructions.map(inst => {
      if (typeof inst === 'string') return inst;
      if (inst.text) return inst.text;
      if (inst.name) return inst.name;
      return '';
    });
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

  private static parseIngredientText(ingredientText: string): { name: string; quantity?: string; unit?: string } {
    const text = ingredientText.trim();
    
    // Common patterns for quantity and unit extraction
    const patterns = [
      // "2 cups flour" -> quantity: "2", unit: "cups", name: "flour"
      /^(\d+(?:\.\d+)?(?:\/\d+)?)\s+(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?)\s+(.+)$/i,
      // "1/2 cup sugar" -> quantity: "1/2", unit: "cup", name: "sugar"
      /^(\d+\/\d+)\s+(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?)\s+(.+)$/i,
      // "2-3 apples" -> quantity: "2-3", unit: "", name: "apples"
      /^(\d+(?:-\d+)?)\s+(.+)$/,
      // "A pinch of salt" -> quantity: "A pinch", unit: "", name: "salt"
      /^(a pinch of|a dash of|a handful of)\s+(.+)$/i,
    ];

    console.log(`Parsing ingredient: "${text}"`);

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        console.log(`Pattern matched:`, match);
        if (pattern.source.includes('cups?|tbsp')) {
          // Has explicit unit
          const result = {
            quantity: match[1],
            unit: match[2],
            name: match[3]
          };
          console.log(`Parsed with unit:`, result);
          return result;
        } else if (match[1].includes('pinch') || match[1].includes('dash') || match[1].includes('handful')) {
          // Descriptive quantity
          const result = {
            quantity: match[1],
            name: match[2]
          };
          console.log(`Parsed descriptive:`, result);
          return result;
        } else {
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
