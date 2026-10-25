# AgentDecoy for PHP sites

One file for cPanel, Apache and LiteSpeed hosting, and any PHP site that is not WordPress (WordPress: use the [plugin](https://simgen.dev/agentdecoy/guard/)). PHP 7.4 or later.

1. Get a free site key at [simgen.dev/agentdecoy](https://simgen.dev/agentdecoy/).
2. Upload `agentdecoy.php` to your site's top folder and paste the key into `$AGENTDECOY_KEY` at the top (or set `AGENTDECOY_KEY` in the environment).
3. Add the lines from `htaccess.txt` to the top of your `.htaccess`.
4. Open `https://yoursite/.env`: you should see a fake file. Then press Verify in your AgentDecoy dashboard.

Optional network block: add `require __DIR__ . '/agentdecoy.php';` at the top of your login, sign-up and contact form scripts. Addresses that used a stolen secret on any AgentDecoy site in the last 14 days get a 403 on form posts; everyone can still read your pages.

What it answers with fakes: `.env` (and `.env.openai`, `.env.anthropic`), `.git/config`, `.aws/credentials`, config backups, `phpinfo.php`, SQL dumps, AI tool configs (`.cursor/mcp.json`, `.mcp.json`, `.vscode/mcp.json`, `.claude/settings.json`), an MCP server at `/mcp`, API docs, a fake admin login, `flag.txt` and a fake AI endpoint. Every fake key is traced to the visit it was taken on. Search engines that say who they are get a plain 404. Nothing about ordinary visitors is sent.
