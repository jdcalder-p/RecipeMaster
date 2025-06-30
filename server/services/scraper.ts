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
    const ingredients = Array.isArray(recipe.recipeIngredient) 
      ? recipe.recipeIngredient.map((ing: any) => typeof ing === 'string' ? ing : ing.text || '')
      : [];

    const instructions = this.parseInstructions(recipe.recipeInstructions || []);
    
    const cookTime = this.parseDuration(recipe.cookTime || recipe.totalTime);
    const servings = this.parseServings(recipe.recipeYield);

    return {
      title: recipe.name || '',
      description: recipe.description || '',
      cookTime,
      servings,
      ingredients: ingredients.filter(Boolean),
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
      ingredients: ingredients.filter(Boolean),
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
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length) {
        return elements.map((_, el) => $(el).text().trim()).get();
      }
    }
    return [];
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

  private static parseServings(yield_: any): number | undefined {
    if (typeof yield_ === 'number') return yield_;
    if (typeof yield_ === 'string') {
      const match = yield_.match(/\d+/);
      return match ? parseInt(match[0]) : undefined;
    }
    return undefined;
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
}
