# Styling System Documentation

## Overview

This project uses a comprehensive, custom SCSS styling system designed specifically for blockchain applications. The design features a futuristic, high-contrast aesthetic with subtle neon accents, full dark/light mode support, smooth animations, and a professional tech look.

## Installation

**Important:** Before running the project, you need to install the `sass` package:

```bash
npm install sass --save-dev
```

## File Structure

```
src/styles/
├── _variables.scss    # Design tokens (colors, typography, spacing, etc.)
├── _mixins.scss       # Reusable SCSS mixins
├── _base.scss         # Base styles and resets
├── _animations.scss   # Keyframe animations and animation utilities
├── _layout.scss       # Layout utilities and spacing system
├── _components.scss   # Component-specific styles
└── main.scss          # Main entry point (imports all partials)
```

## Design System

### Color Palette

**Dark Theme (Default):**
- Primary Background: `#0a0e1a`
- Secondary Background: `#111827`
- Accent Colors: Cyan (`#00d4ff`), Purple (`#7c3aed`), Green (`#10b981`)
- Neon glows with subtle transparency

**Light Theme:**
- Primary Background: `#f8fafc`
- Secondary Background: `#ffffff`
- Same accent colors with adjusted contrast

### Typography

- **Primary Font:** Inter (system font stack fallback)
- **Monospace Font:** JetBrains Mono (for addresses, code)
- **Scale:** Modular scale with 1.25 ratio
- **Sizes:** xs (12px) → 4xl (49px)

### Spacing System

8px base unit system:
- `$spacing-1` = 4px
- `$spacing-2` = 8px
- `$spacing-4` = 16px
- `$spacing-6` = 24px
- etc.

### Breakpoints

Mobile-first responsive design:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

## Usage

### Components

All components use semantic CSS classes:

```jsx
<div className="card">
  <div className="card-header">
    <h2 className="card-title">Title</h2>
  </div>
  <div className="card-body">
    Content here
  </div>
</div>
```

### Buttons

```jsx
<button className="btn btn-primary">Primary</button>
<button className="btn btn-secondary">Secondary</button>
<button className="btn btn-ghost">Ghost</button>

// Sizes
<button className="btn btn-primary btn-sm">Small</button>
<button className="btn btn-primary btn-lg">Large</button>
```

### Forms

```jsx
<div className="form-group">
  <label className="form-label">Label</label>
  <input className="form-input" />
  <div className="form-help">Help text</div>
</div>
```

### Layout Utilities

```jsx
<div className="container">          // Max-width container
<div className="flex items-center">  // Flexbox utilities
<div className="grid grid-cols-3">   // Grid system
<div className="mb-4">                // Spacing utilities
```

### Status Messages

```jsx
<div className="status-message status-message-success">Success</div>
<div className="status-message status-message-error">Error</div>
<div className="status-message status-message-info">Info</div>
<div className="status-message status-message-warning">Warning</div>
```

## Theme System

The project includes a complete dark/light mode system:

1. **Theme Context:** `src/context/ThemeContext.jsx`
2. **Toggle Button:** Available in the navbar
3. **Automatic Detection:** Respects system preferences
4. **Persistence:** Theme choice saved in localStorage

### Using Theme in Components

```jsx
import { useTheme } from '../context/ThemeContext';

function MyComponent() {
  const { theme, toggleTheme } = useTheme();
  // theme is 'dark' or 'light'
}
```

## Key Features

✅ **No CSS Frameworks** - Pure SCSS/CSS  
✅ **Fully Responsive** - Mobile, tablet, desktop  
✅ **Dark/Light Mode** - Complete theme system  
✅ **Accessibility** - WCAG compliant focus states  
✅ **Animations** - Smooth transitions and effects  
✅ **Modular** - Easy to maintain and extend  
✅ **Blockchain Aesthetic** - Futuristic, high-contrast design  

## Customization

### Changing Colors

Edit `src/styles/_variables.scss`:

```scss
$color-accent-primary: #00d4ff;  // Change primary accent
$color-bg-primary: #0a0e1a;      // Change dark theme background
```

### Adding New Components

1. Add styles to `_components.scss`
2. Use existing mixins from `_mixins.scss`
3. Follow the naming convention: `.component-name`

### Adding Animations

1. Define keyframes in `_animations.scss`
2. Use animation utilities or create custom classes

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Notes

- All styles are scoped and don't conflict with external libraries
- The system is designed to be framework-agnostic (works with React, Vue, etc.)
- SCSS variables and mixins make customization easy
- The design prioritizes readability and accessibility

