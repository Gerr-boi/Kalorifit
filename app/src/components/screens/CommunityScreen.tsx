import { useState } from 'react';
import { Heart, MessageCircle, Share2, UserPlus, Trophy } from 'lucide-react';

interface Post {
  id: string;
  user: {
    name: string;
    avatar: string;
    avatarEmoji: string;
  };
  content: string;
  image?: string;
  likes: number;
  comments: number;
  time: string;
  achievement?: {
    type: string;
    value: string;
    icon: string;
  };
}

const posts: Post[] = [
  {
    id: '1',
    user: {
      name: 'Marie Nordmann',
      avatar: '',
      avatarEmoji: '👩‍🦰'
    },
    content: 'Nådde mitt daglige mål med 10,397 skritt i dag! 💪 Og i går ble jeg tante for første gang! 🎉',
    likes: 24,
    comments: 8,
    time: '2t',
    achievement: {
      type: 'steps',
      value: '10,397',
      icon: '👟'
    }
  },
  {
    id: '2',
    user: {
      name: 'Karl Andersen',
      avatar: '',
      avatarEmoji: '👨‍🦱'
    },
    content: 'Endelig nådd vekttapsmålet mitt! -15kg på 3 måneder! 🎉 Takk for all støtte fra communityet!',
    image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=300&fit=crop',
    likes: 156,
    comments: 32,
    time: '5t'
  },
  {
    id: '3',
    user: {
      name: 'Lisa Hansen',
      avatar: '',
      avatarEmoji: '👩'
    },
    content: 'Dagens frokost: Havregrøt med blåbær og honning! 🫐🍯 450 kcal',
    image: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&h=300&fit=crop',
    likes: 45,
    comments: 12,
    time: '7t'
  },
  {
    id: '4',
    user: {
      name: 'Erik Olsen',
      avatar: '',
      avatarEmoji: '👨'
    },
    content: 'Ny personlig rekord på løping! 5km på 22 minutter! 🏃‍♂️💨',
    likes: 89,
    comments: 15,
    time: '1d'
  }
];

const topUsers = [
  { name: 'Marie', emoji: '👩‍🦰', streak: 45 },
  { name: 'Karl', emoji: '👨‍🦱', streak: 38 },
  { name: 'Lisa', emoji: '👩', streak: 32 },
  { name: 'Erik', emoji: '👨', streak: 28 },
];

export default function CommunityScreen() {
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'feed' | 'friends'>('feed');

  const toggleLike = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  return (
    <div className="screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold">Community</h1>
          <div className="flex gap-2">
            <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              🔔
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('feed')}
            className={`pb-2 border-b-2 font-medium ${
              activeTab === 'feed' 
                ? 'border-white text-white' 
                : 'border-transparent text-white/60'
            }`}
          >
            Utforsk
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`pb-2 border-b-2 font-medium ${
              activeTab === 'friends' 
                ? 'border-white text-white' 
                : 'border-transparent text-white/60'
            }`}
          >
            Venner
          </button>
        </div>
      </div>

      {/* Top Performers */}
      <div className="bg-white p-4 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h2 className="font-semibold text-gray-800">Topp denne uken</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {topUsers.map((user, index) => (
            <div key={index} className="flex flex-col items-center min-w-[60px]">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center text-2xl mb-1">
                {user.emoji}
              </div>
              <p className="text-xs font-medium text-gray-700">{user.name}</p>
              <p className="text-xs text-orange-500">{user.streak}🔥</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="pb-24">
        {posts.map((post) => (
          <div key={post.id} className="feed-item">
            {/* Header */}
            <div className="feed-header">
              <div className="w-11 h-11 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center text-xl">
                {post.user.avatarEmoji}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800">{post.user.name}</h3>
                <p className="text-sm text-gray-500">{post.time}</p>
              </div>
              <button className="text-gray-400">
                <UserPlus className="w-5 h-5" />
              </button>
            </div>

            {/* Achievement Badge */}
            {post.achievement && (
              <div className="bg-gradient-to-r from-green-400 to-green-500 rounded-2xl p-4 mb-4 text-white">
                <div className="text-4xl mb-2">{post.achievement.icon}</div>
                <h4 className="text-2xl font-bold uppercase tracking-wide">
                  {post.achievement.type === 'steps' ? 'Skritt' : 'Mål'} Nådd!
                </h4>
                <p className="text-lg">{post.achievement.value} i dag</p>
                <p className="text-sm opacity-90 mt-1">
                  Du nådde og passerte ditt daglige mål. Woohoo!
                </p>
              </div>
            )}

            {/* Content */}
            <p className="text-gray-700 mb-3">{post.content}</p>

            {/* Image */}
            {post.image && (
              <img 
                src={post.image} 
                alt="Post" 
                className="w-full h-64 object-cover rounded-2xl mb-4"
              />
            )}

            {/* Actions */}
            <div className="feed-actions">
              <button 
                onClick={() => toggleLike(post.id)}
                className={`feed-action ${likedPosts.has(post.id) ? 'text-red-500' : ''}`}
              >
                <Heart 
                  className={`w-5 h-5 ${likedPosts.has(post.id) ? 'fill-current' : ''}`} 
                />
                <span>{post.likes + (likedPosts.has(post.id) ? 1 : 0)}</span>
              </button>
              <button className="feed-action">
                <MessageCircle className="w-5 h-5" />
                <span>{post.comments}</span>
              </button>
              <button className="feed-action">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Add Button */}
      <button className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white shadow-lg z-50">
        <span className="text-2xl">+</span>
      </button>
    </div>
  );
}
