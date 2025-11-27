import { TranslationConfig, ProcessedPage } from '../types';
export declare class TSTLAI {
    private config;
    private provider;
    private cache;
    private htmlProcessor;
    constructor(config: TranslationConfig);
    private initializeProvider;
    private initializeCache;
    process(html: string): Promise<ProcessedPage>;
}
//# sourceMappingURL=TSTLAI.d.ts.map