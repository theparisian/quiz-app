export type AppLogoProps = {
  className?: string;
  /** Logo blanc pour fonds sombres */
  variant?: 'default' | 'light';
};

export function AppLogo({ className = 'h-8 w-auto', variant = 'default' }: AppLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Shh!"
      className={[className, variant === 'light' ? 'brightness-0 invert' : '']
        .filter(Boolean)
        .join(' ')}
    />
  );
}
