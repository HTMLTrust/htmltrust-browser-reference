/**
 * Button component
 */
import React from 'react';

/**
 * Button component props
 */
export interface ButtonProps {
  /** The button text */
  children: React.ReactNode;
  /** The button type */
  type?: 'button' | 'submit' | 'reset';
  /** The button variant */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** The click handler */
  onClick?: () => void;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Button component
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  type = 'button',
  variant = 'primary',
  disabled = false,
  onClick,
  className = '',
}) => {
  const baseClass = 'cs-button';
  const variantClass = `${baseClass}--${variant}`;
  const classes = [baseClass, variantClass, className].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};