import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StravaService } from '../services/strava';
import { config } from '../config/config';
import axios from 'axios';

const stravaService = new StravaService();

export default async function stravaRoutes(fastify: FastifyInstance) {
    // Helper function to get refresh token from cookies
    function getRefreshTokenFromCookies(request: FastifyRequest): string | null {
        const cookies = request.headers.cookie;
        if (!cookies) return null;
        
        const cookiePairs = cookies.split(';').map(pair => pair.trim().split('='));
        const refreshTokenCookie = cookiePairs.find(([key]) => key === 'strava_refresh_token');
        
        return refreshTokenCookie && refreshTokenCookie[1] ? refreshTokenCookie[1] : null;
    }

    // Helper function to set secure cookies
    function setSecureCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
        const isProduction = config.get('NODE_ENV') === 'production';
        
        // Set cookies using separate Set-Cookie headers for better compatibility
        const accessTokenCookie = `strava_access_token=${accessToken}; HttpOnly; Path=/; Max-Age=3600${isProduction ? '; Secure' : ''}; SameSite=Lax`;
        const refreshTokenCookie = `strava_refresh_token=${refreshToken}; HttpOnly; Path=/; Max-Age=2592000${isProduction ? '; Secure' : ''}; SameSite=Lax`;
        
        reply.header('Set-Cookie', accessTokenCookie);
        reply.header('Set-Cookie', refreshTokenCookie);
    }

    // OAuth callback endpoint
    fastify.get('/callback', async (request, reply) => {
        try {
            console.log('🔄 OAuth callback received');
            console.log('   Query params:', request.query);
            console.log('   Headers:', request.headers);
            
            const { code, error } = request.query as { code?: string; error?: string };
            
            if (error) {
                console.log('❌ OAuth error:', error);
                return reply.redirect('/login.html?error=' + encodeURIComponent(error));
            }
            
            if (!code) {
                console.log('❌ No authorization code received');
                return reply.redirect('/login.html?error=' + encodeURIComponent('No authorization code received'));
            }

            console.log('🔄 Exchanging authorization code for tokens...');
            console.log('   Code:', code.substring(0, 10) + '...');
            
            // Exchange authorization code for tokens
            const tokenResponse = await axios.post('https://www.strava.com/oauth/token', {
                client_id: config.get('STRAVA_CLIENT_ID'),
                client_secret: config.get('STRAVA_CLIENT_SECRET'),
                code,
                grant_type: 'authorization_code'
            });

            const { access_token, refresh_token, expires_at } = tokenResponse.data;
            
            console.log('✅ Tokens received successfully');
            console.log('   Access token:', access_token ? access_token.substring(0, 10) + '...' : 'MISSING');
            console.log('   Refresh token:', refresh_token ? refresh_token.substring(0, 10) + '...' : 'MISSING');
            console.log('   Access token expires at:', new Date(expires_at * 1000).toISOString());
            
            // Set secure cookies
            setSecureCookies(reply, access_token, refresh_token);
            console.log('🍪 Cookies set successfully');
            
            // Redirect to dashboard
            console.log('🔄 Redirecting to dashboard...');
            return reply.redirect('/');
            
        } catch (error) {
            console.error('❌ Error in OAuth callback:', error);
            if (axios.isAxiosError(error)) {
                console.error('   Response data:', error.response?.data);
                console.error('   Response status:', error.response?.status);
            }
            return reply.redirect('/login.html?error=' + encodeURIComponent('Failed to authenticate with Strava'));
        }
    });

    // Get athlete info
    fastify.get('/athlete', async (request, reply) => {
        try {
            const refreshToken = getRefreshTokenFromCookies(request);
            if (!refreshToken) {
                return reply.status(401).send({ error: 'No refresh token found' });
            }

            const athlete = await stravaService.getAthlete(refreshToken);
            return reply.send(athlete);
        } catch (error) {
            console.error('Error fetching athlete:', error);
            return reply.status(500).send({ error: 'Failed to fetch athlete data' });
        }
    });

    // Get followed athletes
    fastify.get('/following', async (request, reply) => {
        try {
            const refreshToken = getRefreshTokenFromCookies(request);
            if (!refreshToken) {
                return reply.status(401).send({ error: 'No refresh token found' });
            }

            const following = await stravaService.getFollowedAthletes(refreshToken);
            return reply.send(following);
        } catch (error) {
            console.error('Error fetching following:', error);
            return reply.status(500).send({ error: 'Failed to fetch following data' });
        }
    });

    // Get specific activity
    fastify.get('/activities/:id', async (request, reply) => {
        try {
            const refreshToken = getRefreshTokenFromCookies(request);
            if (!refreshToken) {
                return reply.status(401).send({ error: 'No refresh token found' });
            }

            const { id } = request.params as { id: string };
            const activity = await stravaService.getActivity(refreshToken, parseInt(id));
            return reply.send(activity);
        } catch (error) {
            console.error('Error fetching activity:', error);
            return reply.status(500).send({ error: 'Failed to fetch activity data' });
        }
    });

    // Get kudoers for an activity
    fastify.get('/activities/:id/kudos', async (request, reply) => {
        try {
            const refreshToken = getRefreshTokenFromCookies(request);
            if (!refreshToken) {
                return reply.status(401).send({ error: 'No refresh token found' });
            }

            const { id } = request.params as { id: string };
            const kudoers = await stravaService.getActivityKudoers(refreshToken, parseInt(id));
            return reply.send(kudoers);
        } catch (error) {
            console.error('Error fetching kudoers:', error);
            return reply.status(500).send({ error: 'Failed to fetch kudoers data' });
        }
    });

    // Poll for new activities
    fastify.post('/poll-activities', async (request, reply) => {
        try {
            const refreshToken = getRefreshTokenFromCookies(request);
            if (!refreshToken) {
                return reply.status(401).send({ error: 'No refresh token found' });
            }

            await stravaService.pollForNewActivities(refreshToken);
            return reply.send({ message: 'Polling completed successfully' });
        } catch (error) {
            console.error('Error polling activities:', error);
            return reply.status(500).send({ error: 'Failed to poll activities' });
        }
    });

    // Dashboard endpoint - get activities with kudoers
    fastify.get('/kudoers-dashboard', async (request, reply) => {
        try {
            console.log('📊 Dashboard request received');
            console.log('   Cookies header:', request.headers.cookie);
            
            const refreshToken = getRefreshTokenFromCookies(request);
            console.log('   Refresh token found:', refreshToken ? 'YES' : 'NO');
            if (refreshToken) {
                console.log('   Token preview:', refreshToken.substring(0, 10) + '...');
            }
            
            if (!refreshToken) {
                console.log('❌ No refresh token found, returning 401');
                return reply.status(401).send({ error: 'No refresh token found' });
            }

            console.log('📊 Fetching kudoers data for dashboard...');
            
            // Get user's last 10 activities
            const activities = await stravaService.makeAuthenticatedRequest<any[]>(
                'https://www.strava.com/api/v3/athlete/activities?per_page=10',
                refreshToken
            );
            
            console.log('✅ Found', activities.length, 'activities');
            
            // For each activity, get the kudoers
            const activitiesWithKudoers = [];
            for (const activity of activities) {
                console.log('🏃 Checking kudoers for activity:', activity.name);
                
                try {
                    const kudoers = await stravaService.getActivityKudoers(refreshToken, activity.id);
                    console.log('   💪 Found', kudoers.length, 'kudoers for', activity.name);
                    
                    activitiesWithKudoers.push({
                        ...activity,
                        kudoers: kudoers || []
                    });
                    
                } catch (error) {
                    console.error('   ❌ Error fetching kudoers for activity', activity.name, ':', error);
                    // Still include the activity, just with empty kudoers
                    activitiesWithKudoers.push({
                        ...activity,
                        kudoers: []
                    });
                }
            }
            
            console.log('📋 Returning', activitiesWithKudoers.length, 'activities with kudoers data');
            
            return reply.send({ activities: activitiesWithKudoers });
            
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            return reply.status(500).send({ error: 'Failed to fetch dashboard data' });
        }
    });

    // Debug routes endpoint
    fastify.get('/debug-routes', async () => {
        const routes = fastify.printRoutes();
        console.log('🔍 Registered routes:', routes);
        return {
            message: 'Check server console for registered routes',
            routes: routes
        };
    });
}
