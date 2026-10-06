import { defineConfig } from 'tsup';
export default defineConfig({entry:['src/server.ts','src/migrate.ts','src/admin-cli.ts'],format:['esm'],platform:'node',target:'node24',splitting:false,clean:true,noExternal:['@store/contracts']});
