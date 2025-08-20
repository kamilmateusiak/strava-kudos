import axios from 'axios';
import { config } from '../config/config';

interface StravaTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    expires_in: number;
}

interface StravaAthlete {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
}

interface StravaActivity {
    id: number;
    name: string;
    type: string;
    distance: number;
    moving_time: number;
    start_date: string;
    kudos_count: number;
}

interface StravaFollowedAthlete {
    id: number;
    firstname: string;
    lastname: string;
}

export class StravaService {
    private accessToken: string | null = null;
    private tokenExpiresAt: number | null = null;

    constructor() {
        // No longer need to validate refresh token on construction
    }

    async getAccessToken(refreshToken: string): Promise<string> {
        // Check if we have a valid token
        if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
            console.log('✅ Using existing valid token');
            return this.accessToken;
        }

        console.log('🔄 Token expired or missing, refreshing...');
        console.log('   Client ID:', config.get('STRAVA_CLIENT_ID'));
        console.log('   Refresh token:', refreshToken.substring(0, 10) + '...');

        try {
            const response = await axios.post('https://www.strava.com/oauth/token', {
                client_id: config.get('STRAVA_CLIENT_ID'),
                client_secret: config.get('STRAVA_CLIENT_SECRET'),
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });

            const tokenData: StravaTokenResponse = response.data;
            
            this.accessToken = tokenData.access_token;
            this.tokenExpiresAt = tokenData.expires_at * 1000; // Convert to milliseconds
            
            console.log('✅ Token refreshed successfully');
            console.log('   New token expires at:', new Date(this.tokenExpiresAt).toISOString());
            
            return this.accessToken;
        } catch (error) {
            console.error('❌ Failed to refresh token:', error);
            throw new Error('Failed to refresh Strava access token');
        }
    }

    async makeAuthenticatedRequest<T>(url: string, refreshToken: string): Promise<T> {
        const accessToken = await this.getAccessToken(refreshToken);
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                // Token might be invalid, clear it and try again
                this.accessToken = null;
                this.tokenExpiresAt = null;
                const newAccessToken = await this.getAccessToken(refreshToken);
                
                const response = await axios.get(url, {
                    headers: {
                        'Authorization': `Bearer ${newAccessToken}`
                    }
                });
                return response.data;
            }
            throw error;
        }
    }

    async getAthlete(refreshToken: string): Promise<StravaAthlete> {
        return this.makeAuthenticatedRequest<StravaAthlete>('https://www.strava.com/api/v3/athlete', refreshToken);
    }

    async getFollowedAthletes(refreshToken: string): Promise<StravaFollowedAthlete[]> {
        try {
            return await this.makeAuthenticatedRequest<StravaFollowedAthlete[]>('https://www.strava.com/api/v3/athletes/following', refreshToken);
        } catch (error) {
            console.log('⚠️ Could not fetch followed athletes, returning empty array');
            return [];
        }
    }

    async getActivity(refreshToken: string, activityId: number): Promise<StravaActivity> {
        return this.makeAuthenticatedRequest<StravaActivity>(`https://www.strava.com/api/v3/activities/${activityId}`, refreshToken);
    }

    async getActivityKudoers(refreshToken: string, activityId: number): Promise<any[]> {
        return this.makeAuthenticatedRequest<any[]>(`https://www.strava.com/api/v3/activities/${activityId}/kudos`, refreshToken);
    }

    async giveKudos(refreshToken: string, activityId: number): Promise<void> {
        const accessToken = await this.getAccessToken(refreshToken);
        
        await axios.post(`https://www.strava.com/api/v3/activities/${activityId}/kudos`, {}, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
    }

    async pollForNewActivities(refreshToken: string): Promise<void> {
        console.log('📊 Fetching kudoers data for dashboard...');
        
        try {
            // Get user's last 10 activities
            const activities = await this.makeAuthenticatedRequest<StravaActivity[]>(
                'https://www.strava.com/api/v3/athlete/activities?per_page=10',
                refreshToken
            );
            
            console.log('✅ Found', activities.length, 'activities');
            
            // For each activity, get the kudoers
            for (const activity of activities) {
                console.log('🏃 Checking kudoers for activity:', activity.name);
                
                try {
                    const kudoers = await this.getActivityKudoers(refreshToken, activity.id);
                    console.log('   💪 Found', kudoers.length, 'kudoers for', activity.name);
                    
                    // Log kudoer details for debugging
                    kudoers.forEach(kudoer => {
                        console.log('     👤', kudoer.firstname, kudoer.lastname);
                    });
                    
                } catch (error) {
                    console.error('   ❌ Error fetching kudoers for activity', activity.name, ':', error);
                }
            }
            
            console.log('📋 Returning', activities.length, 'activities with kudoers data');
            
        } catch (error) {
            console.error('❌ Error polling for activities:', error);
            throw error;
        }
    }
}
