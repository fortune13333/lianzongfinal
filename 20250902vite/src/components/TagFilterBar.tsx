// TagFilterBar.tsx - Tag pill filter bar for the Dashboard.

import React from 'react';

interface TagFilterBarProps {
  allTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

const TagFilterBar: React.FC<TagFilterBarProps> = ({ allTags, selectedTag, onSelectTag }) => {
  if (allTags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center pt-1">
      <span className="text-xs text-text-500">按标签筛选:</span>
      {allTags.map(tag => (
        <button
          key={tag}
          onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
          className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
            selectedTag === tag
              ? 'bg-primary-600 border-primary-500 text-white'
              : 'border-bg-700 text-text-400 hover:border-primary-500 hover:text-primary-300'
          }`}
        >
          {tag}
        </button>
      ))}
      {selectedTag && (
        <button
          onClick={() => onSelectTag(null)}
          className="text-xs text-text-500 hover:text-text-300 underline"
        >
          清除
        </button>
      )}
    </div>
  );
};

export default TagFilterBar;
