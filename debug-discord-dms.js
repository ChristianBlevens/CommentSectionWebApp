// Debug script to check Discord DMs settings
// Run this in the browser console to debug issues

async function debugDiscordDMs() {
    console.log('=== Discord DMs Debug Info ===');
    
    // 1. Check localStorage
    const user = localStorage.getItem('user');
    const sessionToken = localStorage.getItem('sessionToken');
    console.log('1. LocalStorage Check:');
    console.log('   - Has user:', !!user);
    console.log('   - Has token:', !!sessionToken);
    if (user) {
        try {
            const userData = JSON.parse(user);
            console.log('   - User ID:', userData.id);
            console.log('   - allow_discord_dms:', userData.allow_discord_dms);
        } catch (e) {
            console.log('   - Error parsing user data:', e);
        }
    }
    
    // 2. Check window.ENV
    console.log('\n2. Environment Check:');
    console.log('   - window.ENV:', window.ENV);
    console.log('   - DISCORD_SERVER_URL:', window.ENV?.DISCORD_SERVER_URL);
    
    // 3. Check session validation
    if (sessionToken) {
        console.log('\n3. Session Validation Check:');
        try {
            const response = await fetch('/api/session/validate', {
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                console.log('   - Session valid');
                console.log('   - Response data:', data);
                console.log('   - allow_discord_dms in response:', data.allow_discord_dms);
            } else {
                console.log('   - Session invalid:', response.status);
            }
        } catch (e) {
            console.log('   - Error validating session:', e);
        }
    }
    
    // 4. Check Alpine.js app instance
    console.log('\n4. Alpine.js App Check:');
    if (window.unifiedAppInstance) {
        console.log('   - App instance exists');
        console.log('   - User in app:', window.unifiedAppInstance.user);
        console.log('   - allow_discord_dms in app:', window.unifiedAppInstance.user?.allow_discord_dms);
    } else {
        console.log('   - App instance not found');
    }
    
    // 5. Test the toggle endpoint
    if (sessionToken) {
        console.log('\n5. Toggle Endpoint Test:');
        try {
            const currentValue = window.unifiedAppInstance?.user?.allow_discord_dms ?? true;
            const response = await fetch('/api/users/discord-dms', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    allow_discord_dms: !currentValue
                })
            });
            if (response.ok) {
                const data = await response.json();
                console.log('   - Toggle successful');
                console.log('   - New value:', data.allow_discord_dms);
                // Toggle back
                await fetch('/api/users/discord-dms', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${sessionToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        allow_discord_dms: currentValue
                    })
                });
                console.log('   - Toggled back to original value');
            } else {
                console.log('   - Toggle failed:', response.status);
            }
        } catch (e) {
            console.log('   - Error testing toggle:', e);
        }
    }
    
    console.log('\n=== End Debug Info ===');
}

// Run the debug function
debugDiscordDMs();