import { Provider } from 'react-redux';
import { store } from '@/store';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeProvider } from '../ThemeProvider';
import TopBar from '../TopBar';

export default function TopBarExample() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <SidebarProvider>
          <TopBar onAgentClick={() => console.log('Agent clicked')} />
        </SidebarProvider>
      </ThemeProvider>
    </Provider>
  );
}
