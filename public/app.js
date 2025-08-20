// Strava Kudos Dashboard App
class KudosDashboard {
    constructor() {
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.bindEvents();
    }

    checkAuthentication() {
        // Don't check cookies on client side since they're HTTP-only
        // Just try to load the dashboard - if it fails with 401, we'll redirect to login
        this.loadDashboard();
    }

    bindEvents() {
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.loadDashboard();
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });
    }

    async loadDashboard() {
        this.showLoading();
        this.hideError();

        try {
            const response = await fetch('/strava/kudoers-dashboard', {
                credentials: 'include' // Include cookies
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Unauthorized - token expired or invalid
                    this.logout();
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.renderDashboard(data);
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showError('Failed to load dashboard data. Please try again.');
        }
    }

    renderDashboard(data) {
        this.hideLoading();
        
        if (!data.activities || data.activities.length === 0) {
            this.showError('No activities found.');
            return;
        }

        // Calculate stats
        const totalKudoers = data.activities.reduce((sum, activity) => sum + activity.kudoers.length, 0);
        const uniquePeople = new Set();
        
        data.activities.forEach(activity => {
            activity.kudoers.forEach(kudoer => {
                const key = `${kudoer.firstname} ${kudoer.lastname}`;
                uniquePeople.add(key);
            });
        });

        // Update stats
        document.getElementById('totalKudoers').textContent = totalKudoers;
        document.getElementById('uniquePeople').textContent = uniquePeople.size;

        // Calculate most active kudoers
        this.renderMostActiveKudoers(data.activities, data.patterns);

        // Render activities
        this.renderActivities(data.activities);

        // Show content
        document.getElementById('stats').classList.remove('hidden');
        document.getElementById('mostActiveKudoers').classList.remove('hidden');
        document.getElementById('activityList').classList.remove('hidden');
    }

    renderMostActiveKudoers(activities, patterns) {
        // Only consider the last 5 activities for "most active kudoers"
        const recentActivities = activities.slice(0, 5);
        
        // Count kudoer frequency across recent activities only
        const kudoerCounts = {};
        recentActivities.forEach(activity => {
            if (activity.kudoers && Array.isArray(activity.kudoers)) {
                activity.kudoers.forEach(kudoer => {
                    const key = `${kudoer.firstname} ${kudoer.lastname}`;
                    kudoerCounts[key] = (kudoerCounts[key] || 0) + 1;
                });
            }
        });

        // Sort by frequency (highest first) and take top 10
        const sortedKudoers = Object.entries(kudoerCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        const container = document.getElementById('mostActiveKudoersContent');
        if (!container) return;

        if (sortedKudoers.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No kudoers found in recent activities</p>';
            return;
        }

        let html = '<p class="text-sm text-gray-600 mb-4">People who gave you kudos in your last 5 activities, ranked by total kudos across all 10 activities</p>';
        html += '<div class="space-y-2">';
        
        sortedKudoers.forEach(([name, count], index) => {
            const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : '';
            
            // Get pattern data for this kudoer
            const pattern = patterns.find(p => p.name === name);
            let patternText = '';
            
            if (pattern && pattern.types) {
                const topTypes = Object.entries(pattern.types)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 3)
                    .map(([type, typeCount]) => `${type}(${typeCount})`)
                    .join(', ');
                patternText = topTypes ? ` • Prefers: ${topTypes}` : '';
                
                // Add distance pattern if available
                if (pattern.avgDistance && pattern.minDistance !== Infinity) {
                    const distanceRange = `${pattern.minDistance.toFixed(1)}-${pattern.maxDistance.toFixed(1)}km`;
                    const avgDist = pattern.avgDistance.toFixed(1);
                    patternText += ` • Distance: ${distanceRange} (avg: ${avgDist}km)`;
                    
                    // Detect distance threshold preferences
                    const distanceThresholds = [1, 5, 10, 20, 50]; // km
                    const distancePreferences = [];
                    
                    for (const threshold of distanceThresholds) {
                        const aboveThreshold = pattern.distances.filter(dist => dist >= threshold).length;
                        const percentage = (aboveThreshold / pattern.distances.length) * 100;
                        
                        if (percentage >= 80) { // If 80%+ of their kudos are above threshold
                            distancePreferences.push(`≥${threshold}km`);
                        }
                    }
                    
                    if (distancePreferences.length > 0) {
                        patternText += ` • Prefers: ${distancePreferences.join(', ')}`;
                    }
                }
            }
            
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div class="flex items-center space-x-3">
                        <span class="text-lg">${medal}</span>
                        <div>
                            <span class="font-medium text-gray-900">${name}</span>
                            <p class="text-xs text-gray-600">${count} kudo${count > 1 ? 's' : ''}${patternText}</p>
                        </div>
                    </div>
                    <span class="text-sm font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                        ${count} kudo${count > 1 ? 's' : ''}
                    </span>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    renderActivities(activities) {
        const container = document.getElementById('activities');
        container.innerHTML = '';

        activities.forEach(activity => {
            const activityCard = this.createActivityCard(activity);
            container.appendChild(activityCard);
        });
    }

    createActivityCard(activity) {
        const card = document.createElement('div');
        card.className = 'bg-white shadow rounded-lg overflow-hidden';
        
        const kudoersList = activity.kudoers.map(kudoer => 
            `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2 mb-2">${kudoer.firstname} ${kudoer.lastname}</span>`
        ).join('');

        card.innerHTML = `
            <div class="px-6 py-4">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-medium text-gray-900">${activity.name}</h3>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        ${activity.type}
                    </span>
                </div>
                <div class="text-sm text-gray-600 mb-3">
                    <p><strong>Date:</strong> ${new Date(activity.start_date).toLocaleDateString()}</p>
                    <p><strong>Distance:</strong> ${(activity.distance / 1000).toFixed(2)} km</p>
                    <p><strong>Duration:</strong> ${Math.round(activity.moving_time / 60)} minutes</p>
                </div>
                <div class="border-t pt-3">
                    <h4 class="text-sm font-medium text-gray-700 mb-2">Kudoers (${activity.kudoers.length})</h4>
                    <div class="flex flex-wrap">
                        ${kudoersList}
                    </div>
                </div>
            </div>
        `;

        return card;
    }

    logout() {
        // Clear cookies by redirecting to login (cookies will be cleared server-side)
        window.location.href = '/login.html';
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('stats').classList.add('hidden');
        document.getElementById('mostActiveKudoers').classList.add('hidden');
        document.getElementById('activityList').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('loading').classList.add('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new KudosDashboard();
});

