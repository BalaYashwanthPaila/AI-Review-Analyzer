import React from "react";
import Head from "next/head";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import "react-tabs/style/react-tabs.css";
import ContextUpload from "@/components/ContextUpload";
import ReviewAnalyzer from "@/components/ReviewAnalyzer";

export default function Home() {
  return (
    <div className="min-h-screen p-4 md:p-8">
      <Head>
        <title>AI Review Analyzer</title>
        <meta
          name="description"
          content="AI-powered Play Store review analyzer and response generator"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="text-3xl font-bold mb-8 text-center">
          AI Play Store Review Analyzer
        </h1>

        <Tabs className="w-full max-w-4xl mx-auto">
          <TabList className="flex mb-4 border-b">
            <Tab className="px-4 py-2 cursor-pointer focus:outline-none">
              Context Setup
            </Tab>
            <Tab className="px-4 py-2 cursor-pointer focus:outline-none">
              Review Analysis
            </Tab>
          </TabList>

          <TabPanel>
            <ContextUpload />
          </TabPanel>

          <TabPanel>
            <ReviewAnalyzer />
          </TabPanel>
        </Tabs>
      </main>
    </div>
  );
}
