// YouTube API key - Replace with your own API key
// Remove this line
// const API_KEY = 'AIzaSyB-nUBxZnGyIS5xTvksUCdELLEQK2ito0s';

// Use config.API_KEY instead throughout your code
const API_KEY = config.API_KEY;

// DOM elements
const urlForm = document.getElementById('urlForm');
const videoUrlInput = document.getElementById('videoUrl');
const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');
const timestampsElement = document.getElementById('timestamps');

// Extract video ID from YouTube URL
function getVideoId(url) {
    try {
        // Handle different YouTube URL formats
        const urlObj = new URL(url);
        
        // Standard youtube.com/watch?v=VIDEO_ID format
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }
        
        // Short youtu.be/VIDEO_ID format
        else if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.substring(1);
        }
        
        // Handle embedded URLs
        else if (urlObj.hostname.includes('youtube-nocookie.com')) {
            return urlObj.pathname.split('/').pop();
        }
        
        return null;
    } catch (error) {
        console.error('Error parsing URL:', error);
        return null;
    }
}

// Format timestamp to HH:MM:SS
function formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(String(hours).padStart(2, '0'));
    parts.push(String(minutes).padStart(2, '0'));
    parts.push(String(remainingSeconds).padStart(2, '0'));

    return parts.join(':');
}

// Convert timestamp string (HH:MM:SS or MM:SS) to seconds
function timestampToSeconds(timestamp) {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return 0;
}

// Extract timestamps from text
function extractTimestamps(text) {
    const timestampRegex = /(\d+:)?(\d+):(\d+)/g;
    const timestamps = [];
    
    // Convert HTML entities and remove HTML tags
    let cleanedText = text.replace(/&amp;/g, '&')
                         .replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>')
                         .replace(/<a\s+(?:[^>]*?\s+)?href="[^"]*"[^>]*>(.*?)<\/a>/g, '$1')
                         .replace(/<[^>]*>/g, '');
    
    // Find all timestamps
    let lines = cleanedText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let match;
        
        while ((match = timestampRegex.exec(line)) !== null) {
            const timestampText = match[0];
            const startIndex = match.index;
            
            // Extract description text (everything after the timestamp)
            let description = line.substring(startIndex + timestampText.length).trim();
            
            // Clean up the description
            description = description
                .replace(/^[\s\-:,.]+/, '')  // Remove leading punctuation
                .replace(/\(.*?\)/g, '')     // Remove text in parentheses
                .trim();
            
            // If description is empty, try to use the next line
            if (!description && i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                if (nextLine && !nextLine.match(timestampRegex)) {
                    description = nextLine;
                }
            }
            
            // If still no description, use a generic label
            if (!description) {
                description = "Timestamp";
            }
            
            timestamps.push({
                time: timestampText,
                text: description,
                seconds: timestampToSeconds(timestampText)
            });
        }
    }
    
    return timestamps;
}

function convertToSeconds(timestamp) {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

// Fetch video data and comments
async function fetchVideoData(videoId) {
    try {
        // Fetch video details
        const videoResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${API_KEY}`
        );
        const videoData = await videoResponse.json();

        if (!videoData.items || videoData.items.length === 0) {
            throw new Error('Video not found');
        }

        const description = videoData.items[0].snippet.description;
        let timestamps = extractTimestamps(description);

        // Fetch video comments
        const commentsResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&key=${API_KEY}`
        );
        const commentsData = await commentsResponse.json();

        // Extract timestamps from comments
        if (commentsData.items) {
            for (const item of commentsData.items) {
                const commentText = item.snippet.topLevelComment.snippet.textDisplay;
                const commentTimestamps = extractTimestamps(commentText);
                timestamps = timestamps.concat(commentTimestamps);
            }
        }

        // Sort timestamps by time
        timestamps.sort((a, b) => a.seconds - b.seconds);

        // Remove duplicates
        const uniqueTimestamps = [];
        const seen = new Set();
        
        for (const timestamp of timestamps) {
            if (!seen.has(timestamp.seconds)) {
                seen.add(timestamp.seconds);
                uniqueTimestamps.push(timestamp);
            }
        }

        return uniqueTimestamps;
    } catch (error) {
        throw new Error('Failed to fetch video data: ' + error.message);
    }
}

// Display timestamps in the UI
function displayTimestamps(timestamps, videoId) {
    const timestampsContainer = document.getElementById('timestamps');
    timestampsContainer.innerHTML = '';
    
    if (timestamps.length === 0) {
        timestampsContainer.innerHTML = '<p>No timestamps found for this video.</p>';
        return;
    }
    
    timestamps.forEach(timestamp => {
        const timestampItem = document.createElement('div');
        timestampItem.className = 'timestamp-item';
        
        const link = document.createElement('a');
        link.className = 'timestamp-link';
        link.href = `https://www.youtube.com/watch?v=${videoId}&t=${timestamp.seconds}s`;
        link.target = '_blank';
        link.textContent = timestamp.time;
        
        const text = document.createElement('span');
        text.textContent = timestamp.text;
        
        timestampItem.appendChild(link);
        timestampItem.appendChild(text);
        timestampsContainer.appendChild(timestampItem);
    });
}

// Handle form submission
urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const videoUrl = videoUrlInput.value.trim();
    if (!videoUrl) return;

    try {
        const videoId = getVideoId(videoUrl);
        if (!videoId) throw new Error('Invalid YouTube URL');

        errorElement.textContent = '';
        loadingElement.style.display = 'block';
        timestampsElement.innerHTML = '';

        const timestamps = await fetchVideoData(videoId);
        displayTimestamps(timestamps, videoId);
    } catch (error) {
        errorElement.textContent = error.message;
        timestampsElement.innerHTML = '';
    } finally {
        loadingElement.style.display = 'none';
    }
});