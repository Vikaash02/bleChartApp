/**
 * @file App.js
 * @brief Application Entry Point (Root Component).
 * @version 1.0.0
 * 
 * @section role_sec Component Role
 * This component is the "Root" of the React Native component tree. 
 * It is registered in `index.js` via `AppRegistry`.
 * 
 * @section resp_sec Responsibilities
 * 1.  Initialize global providers (if any, e.g., ThemeProvider, AuthProvider).
 * 2.  Load the primary Navigation or Screen container.
 * 
 * Current configuration loads `DashboardScreen` directly as a single-screen app.
 */

import React from 'react';
import DashboardScreen from './src/screens/DashboardScreen';

/**
 * @brief Root Function Component.
 * @return {JSX.Element} The rendered application.
 */
const App = () => {
  return <DashboardScreen />;
};

export default App;