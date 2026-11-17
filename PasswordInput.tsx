import { Eye, EyeOff } from 'lucide-react';
import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  startIcon?: React.ReactNode;
  wrapperClassName?: string;
}

export function PasswordInput({
  startIcon,
  className = '',
  wrapperClassName = '',
  ...props
}: PasswordInputProps) {
  const { tr } = useLanguage();
  const [visible, setVisible] = useState(false);

  const toggleLabel = visible
    ? tr('إخفاء كلمة المرور', 'Hide password')
    : tr('إظهار كلمة المرور', 'Show password');

  return (
    <div className={`relative ${wrapperClassName}`}>
      {startIcon && (
        <span className="absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {startIcon}
        </span>
      )}
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className} ${startIcon ? 'ps-10' : ''} pe-10`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={toggleLabel}
        aria-pressed={visible}
        title={toggleLabel}
        className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#A8A29E] hover:text-[#E5C158] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] transition-colors cursor-pointer"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
