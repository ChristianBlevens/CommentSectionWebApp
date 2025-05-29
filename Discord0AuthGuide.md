# Discord OAuth Setup Guide for Comment System

## Why Discord OAuth?

Discord OAuth works better than Google OAuth for iframe-embedded applications because:
- Discord doesn't restrict OAuth flows in iframes
- Your target audience (gamers, developers, communities) likely already has Discord
- Consistent user IDs across all embedded sites
- No additional costs or restrictions

## Setup Steps

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name your application (e.g., "My Comment System")
4. Go to the "OAuth2" section in the sidebar
5. Copy your **Client ID** and **Client Secret**

### 2. Configure OAuth2 Settings

In the OAuth2 section:

1. Add Redirect URIs:
   ```
   http://localhost:8080
   http://localhost:8080/
   https://yourdomain.com
   https://yourdomain.com/
   ```
   Add ALL domains where you'll embed the comment system

2. Save changes

### 3. Update Frontend Code

In the comment system HTML file, replace:
```javascript
const clientId = 'YOUR_DISCORD_CLIENT_ID'; // Replace with your Discord app ID
```

With your actual Discord Client ID.

### 4. Update Backend Environment

Create a `.env` file for your backend:
```env
# API Server
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_NAME=comments_db
REDIS_URL=redis://localhost:6379

# Discord OAuth
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:8080
```

### 5. Install Backend Dependencies

```bash
cd comment-api
npm install axios  # Added for Discord API calls
```

## How Discord OAuth Works in This System

1. **User clicks "Sign in with Discord"**
   - Opens Discord authorization in a popup window
   - User approves the application

2. **Discord redirects back with code**
   - The popup receives an authorization code
   - Frontend sends code to backend

3. **Backend exchanges code for user data**
   - Backend contacts Discord API
   - Gets user ID, username, and avatar
   - Creates/updates user in database

4. **User can now comment**
   - User data stored in localStorage
   - Consistent across page reloads

## Discord User Data Structure

```javascript
{
    id: "discord_123456789",  // Prefixed Discord ID
    username: "CoolUser",
    avatar: "https://cdn.discordapp.com/avatars/...",
    email: "123456789@discord.user"  // Synthetic email
}
```

## Important Notes

1. **Avatar URLs**: Discord avatars are served from CDN, no CORS issues
2. **User IDs**: Prefixed with "discord_" to avoid conflicts
3. **Email**: Discord doesn't always provide email, so we create a synthetic one
4. **Discriminators**: Discord is phasing these out, but we handle both formats

## Testing

1. Start your backend server:
   ```bash
   npm run dev
   ```

2. Serve your frontend:
   ```bash
   python -m http.server 8080
   ```

3. Visit `http://localhost:8080?pageId=test`
4. Click "Sign in with Discord"
5. Authorize the application
6. You should be signed in!

## Production Deployment

1. **Update Redirect URIs**: Add all production domains in Discord Developer Portal
2. **Environment Variables**: Set proper values in production
3. **HTTPS**: Use HTTPS in production for security
4. **CORS**: Configure CORS to only allow your domains

## Troubleshooting

### "Invalid OAuth2 redirect_uri"
- Make sure the redirect URI exactly matches what's in Discord settings
- Include both with and without trailing slash
- Protocol (http/https) must match exactly

### User avatar not showing
- Check if user has custom avatar
- Default avatars are based on discriminator

### Popup blocked
- Users need to allow popups for your site
- Show a message if popup is blocked

## Alternative: Direct Redirect (No Popup)

If popups are problematic, you can use direct redirect:

```javascript
// Instead of window.open, use:
window.location.href = discordAuthUrl;
```

This takes the user away from the page but works in all browsers.

## Security Best Practices

1. **Never expose Client Secret** in frontend code
2. **Validate state parameter** to prevent CSRF
3. **Use HTTPS in production**
4. **Limit OAuth scopes** - only request 'identify'
5. **Rate limit** OAuth endpoints

The Discord OAuth implementation is now complete and ready to use!