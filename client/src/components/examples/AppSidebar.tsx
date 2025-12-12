import { Provider } from 'react-redux';
import { store } from '@/store';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeProvider } from '../ThemeProvider';
import AppSidebar from '../AppSidebar';

export default function AppSidebarExample() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </ThemeProvider>
    </Provider>
  );
}
