import { Tstlai } from '../core/Tstlai';

export const createNextIntegration = (translator: Tstlai) => {
  return {
    /**
     * React Server Component for translation.
     * Usage: <Translate>Hello World</Translate>
     */
    Translate: async (props: { children: string | any }) => {
       const text = props.children;
       // Only translate raw strings
       if (typeof text !== 'string') return text;
       
       try {
         return await translator.translateText(text);
       } catch (err) {
         console.error('[Tstlai] Next.js Translation Error:', err);
         return text;
       }
    }
  };
};
