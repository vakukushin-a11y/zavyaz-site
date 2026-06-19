import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import WelcomePage from "@/pages/welcome";
import ProductionPage from "@/pages/production";
import NewsPage from "@/pages/news";
import KnowledgePage from "@/pages/knowledge";
import VkPage from "@/pages/vk";
import NavBar from "@/components/NavBar";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={WelcomePage} />
      <Route path="/production" component={ProductionPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/news" component={NewsPage} />
      <Route path="/knowledge" component={KnowledgePage} />
      <Route path="/vk" component={VkPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
          <NavBar />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
