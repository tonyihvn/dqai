
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, action, onClick }) => {
  const clickClass = onClick ? ' cursor-pointer' : '';
  const tabIndex = onClick ? 0 : undefined;
  return (
    <div onClick={onClick} tabIndex={tabIndex} className={`bg-white shadow-md rounded-lg overflow-hidden ${className}${clickClass}`}>
      {(title || action) && (
        <div className="px-4 py-4 sm:px-6 border-b border-gray-200 flex justify-between items-center">
          {title && <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
};

export default Card;
