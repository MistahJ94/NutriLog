# 🥗 NutriLog

A modern, privacy-focused nutrition and macro tracking platform for managing daily nutrition, foods, meals, and personal goals.

NutriLog is designed with an **offline-first foundation** while being built to expand into a scalable, multi-user web platform with accounts, cloud synchronization, and cross-device access.

## ✨ Features

### 📊 Tracker

* ✨ **Modern UI** - Clean interface with smooth animations and visual feedback
* 📊 **Real-Time Statistics** - Track calories, protein, carbohydrates, fat, and fiber
* 🎯 **Macro Progress** - Visual progress toward daily nutrition goals
* ⚡ **Quick Add** - Quickly log foods with manual entry
* 🚀 **Quick Access** - One-click logging from saved foods and meals
* 📝 **Daily Log** - View everything logged throughout the day
* 🕐 **Timestamps** - Track when foods and meals were added
* 🗑️ **Easy Management** - Remove incorrectly logged items

### 🎯 Planner

* 🎯 **Custom Goals** - Set personalized calorie and macro targets
* 📊 **Macro Breakdown** - Visualize your daily calorie distribution
* 🔄 **Quick Presets** - Balanced, High Protein, and Low Carb presets
* 🌾 **Fiber Tracking** - Set and monitor daily fiber goals
* 💡 **Smart Hints** - See calorie contributions from individual macros
* 💾 **Persistent Goals** - Goals remain available across sessions

### 🥑 Foods

* 🔍 **USDA Food Search** - Search the USDA FoodData Central database
* 🗄️ **Personal Food Database** - Save frequently eaten foods
* 📏 **Serving Sizes** - Define custom serving sizes
* 🔢 **Complete Nutrition Data** - Track calories, protein, carbohydrates, fat, and other nutritional information
* ➕ **Quick Logging** - Add saved foods directly to your daily tracker
* ✏️ **Easy Management** - Edit or delete saved foods
* 🎯 **Automatic Data Entry** - USDA search results populate nutritional information automatically

### 🍽️ Meals

* 🎯 **Meal Builder** - Create custom meals using saved foods
* 🔢 **Quantity Control** - Adjust the quantity of individual ingredients
* 📊 **Automatic Calculations** - Nutrition totals are calculated automatically
* 💾 **Saved Meals** - Save frequently eaten meals for quick access
* 🍳 **Meal Templates** - Create reusable breakfast, lunch, dinner, and other meal templates
* ⚡ **One-Click Logging** - Add an entire saved meal to your daily tracker

## 🔐 Privacy & Data

NutriLog is designed with privacy and user ownership in mind.

The current version uses local browser storage for data persistence, allowing NutriLog to operate without requiring an account or external database.

The architecture is being developed to support future functionality including:

* 👤 User accounts
* 🔐 Authentication
* ☁️ Cloud synchronization
* 💻 Cross-device access
* 📱 Offline-first synchronization
* 🗄️ Centralized database storage
* 👥 Multi-user support

The goal is to allow users to retain control of their nutrition data while providing the convenience of accessing it across multiple devices.

## 📱 Responsive Design

NutriLog is designed to work across:

* 💻 Desktop
* 💻 Laptop
* 📱 Mobile
* 📲 Tablet

The interface adapts to different screen sizes while maintaining the same core functionality.

## 🚀 Getting Started

### Installation

Clone the repository and install the required dependencies:

```bash
npm install
```

### Development

Start the local development server:

```bash
npm run dev
```

Open your browser and navigate to:

```text
http://localhost:5173
```

### Production Build

Create a production build:

```bash
npm run build
```

## 📖 How to Use

### 🎯 Setting Your Goals

1. Navigate to the **Planner** tab.
2. Choose a preset or create custom goals.
3. Set your target calories.
4. Set your protein, carbohydrate, fat, and fiber goals.
5. Review the calorie breakdown.
6. Save your goals.

Your goals will be used throughout NutriLog to calculate your daily progress.

### 🥑 Building Your Food Database

1. Navigate to the **Foods** tab.
2. Search the USDA FoodData Central database or enter a food manually.
3. Select a food from the search results.
4. Review the nutritional information.
5. Adjust the serving size if necessary.
6. Save the food to your personal database.

Frequently eaten foods can then be accessed quickly from the Tracker and Meal Builder.

### 🍽️ Creating Meals

1. Navigate to the **Meals** tab.
2. Enter a meal name.
3. Select foods


