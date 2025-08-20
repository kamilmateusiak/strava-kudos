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
        try {
            console.log('🔄 Polling for new activities...');
            
            // Fetch user's last 10 activities
            const activities = await this.makeAuthenticatedRequest<StravaActivity[]>(
                'https://www.strava.com/api/v3/athlete/activities?per_page=10',
                refreshToken
            );
            
            console.log(`✅ Found ${activities.length} activities`);
            
            // Collect kudoers and analyze patterns
            const kudoerPatterns = new Map<string, { 
                count: number; 
                activities: string[]; 
                types: Map<string, number>;
                distances: number[];
                minDistance: number;
                maxDistance: number;
                avgDistance: number;
            }>();
            
            for (const activity of activities) {
                console.log(`🏃 Checking kudoers for activity: ${activity.name}`);
                
                try {
                    const kudoers = await this.getActivityKudoers(refreshToken, activity.id);
                    console.log(`   💪 Found ${kudoers.length} kudoers for ${activity.name}`);
                    
                    // Analyze each kudoer's pattern
                    kudoers.forEach(kudoer => {
                        const key = `${kudoer.firstname} ${kudoer.lastname}`;
                        const activityType = activity.type;
                        const distance = activity.distance / 1000; // Convert meters to kilometers
                        
                        if (!kudoerPatterns.has(key)) {
                            kudoerPatterns.set(key, {
                                count: 0,
                                activities: [],
                                types: new Map<string, number>(),
                                distances: [],
                                minDistance: Infinity,
                                maxDistance: 0,
                                avgDistance: 0
                            });
                        }
                        
                        const pattern = kudoerPatterns.get(key)!;
                        pattern.count++;
                        pattern.activities.push(activity.name);
                        pattern.distances.push(distance);
                        
                        // Update distance stats
                        pattern.minDistance = Math.min(pattern.minDistance, distance);
                        pattern.maxDistance = Math.max(pattern.maxDistance, distance);
                        
                        // Count activity types
                        const currentTypeCount = pattern.types.get(activityType) || 0;
                        pattern.types.set(activityType, currentTypeCount + 1);
                    });
                    
                } catch (error) {
                    console.error(`❌ Error getting kudoers for activity ${activity.name}:`, error);
                }
            }
            
            // Calculate average distances and detect distance patterns
            for (const [name, pattern] of kudoerPatterns) {
                pattern.avgDistance = pattern.distances.reduce((sum, dist) => sum + dist, 0) / pattern.distances.length;
                
                // Detect if they only give kudos to activities above certain thresholds
                const distanceThresholds = [1, 5, 10, 20, 50]; // km
                const distancePatterns = [];
                
                for (const threshold of distanceThresholds) {
                    const aboveThreshold = pattern.distances.filter(dist => dist >= threshold).length;
                    const percentage = (aboveThreshold / pattern.distances.length) * 100;
                    
                    if (percentage >= 80) { // If 80%+ of their kudos are above threshold
                        distancePatterns.push(`≥${threshold}km`);
                    }
                }
                
                if (distancePatterns.length > 0) {
                    console.log(`   ${name}: Distance preference - ${distancePatterns.join(', ')}`);
                }
            }
            
            // Log pattern analysis
            console.log('📊 Kudoer Pattern Analysis:');
            for (const [name, pattern] of kudoerPatterns) {
                const topTypes = Array.from(pattern.types.entries())
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 3)
                    .map(([type, count]) => `${type}(${count})`)
                    .join(', ');
                
                const distanceRange = `${pattern.minDistance.toFixed(1)}-${pattern.maxDistance.toFixed(1)}km`;
                const avgDist = pattern.avgDistance.toFixed(1);
                
                console.log(`   ${name}: ${pattern.count} kudos - Prefers: ${topTypes} | Distance: ${distanceRange} (avg: ${avgDist}km)`);
            }
            
        } catch (error) {
            console.error('❌ Error polling for activities:', error);
            throw error;
        }
    }
}
