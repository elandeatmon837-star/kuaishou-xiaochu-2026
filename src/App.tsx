/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Utensils, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  RotateCcw, 
  ChefHat, 
  Loader2,
  ArrowRight,
  Heart
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Meal {
  name: string;
  description: string;
  imageUrl?: string;
  steps?: string[];
  stepImages?: string[];
}

type AppState = "input" | "suggestions" | "cooking" | "finish";

export default function App() {
  const [ingredients, setIngredients] = useState("");
  const [state, setState] = useState<AppState>("input");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");

  const generateImage = async (prompt: string) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (error) {
      console.error("Image generation failed:", error);
    }
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/800/800`;
  };

  const handleSuggest = async () => {
    if (!ingredients.trim()) return;
    setLoading(true);
    setLoadingText("正在为您构思美味佳肴...");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `基于以下食材: ${ingredients}, 推荐3个简单好做的中式快手菜。
        请以JSON格式返回，包含一个名为meals的数组，每个对象包含name和description。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              meals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["name", "description"],
                },
              },
            },
            required: ["meals"],
          },
        },
      });

      const data = JSON.parse(response.text || "{}");
      const suggestedMeals: Meal[] = data.meals || [];

      // Generate images for each meal
      setLoadingText("正在为您准备精美图片...");
      const mealsWithImages = await Promise.all(
        suggestedMeals.map(async (meal) => ({
          ...meal,
          imageUrl: await generateImage(`Professional food photography of ${meal.name}, delicious, plated nicely, high quality`),
        }))
      );

      setMeals(mealsWithImages);
      setState("suggestions");
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMeal = async (meal: Meal) => {
    setLoading(true);
    setLoadingText(`正在为您拆解 ${meal.name} 的烹饪步骤...`);
    setSelectedMeal(meal);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `请为菜品 "${meal.name}" 提供详细的烹饪步骤。
        请以JSON格式返回，包含一个名为steps的字符串数组。`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["steps"],
          },
        },
      });

      const data = JSON.parse(response.text || "{}");
      const steps: string[] = data.steps || [];

      setLoadingText("正在为您生成每一步的示意图...");
      const stepImages = await Promise.all(
        steps.map((step) => generateImage(`Close-up photo of cooking step: ${step}, professional kitchen lighting, high quality`))
      );

      setSelectedMeal({ ...meal, steps, stepImages });
      setCurrentStep(0);
      setState("cooking");
    } catch (error) {
      console.error("Failed to fetch steps:", error);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (selectedMeal?.steps && currentStep < selectedMeal.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setState("finish");
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const reset = () => {
    setIngredients("");
    setMeals([]);
    setSelectedMeal(null);
    setCurrentStep(0);
    setState("input");
  };

  return (
    <div className="min-h-screen bg-[#fdfcf8] text-gray-800 font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-orange-100">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
              <ChefHat size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-orange-600">快手小厨</h1>
          </div>
          {state !== "input" && (
            <button 
              onClick={reset}
              className="text-sm font-medium text-gray-500 hover:text-orange-500 transition-colors flex items-center gap-1"
            >
              <RotateCcw size={14} />
              重新开始
            </button>
          )}
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="relative">
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <ChefHat size={20} className="text-orange-300" />
                </div>
              </div>
              <p className="mt-6 text-lg font-medium text-gray-600">{loadingText}</p>
            </motion.div>
          ) : state === "input" ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                  今天家里有什么食材？
                </h2>
                <p className="text-gray-500">输入您现有的食材，我来为您出谋划策</p>
              </div>

              <div className="relative group">
                <textarea
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  placeholder="例如：西红柿，鸡蛋，青椒..."
                  className="w-full h-40 p-6 bg-white border-2 border-orange-100 rounded-3xl focus:border-orange-400 focus:ring-4 focus:ring-orange-50 outline-none transition-all text-lg resize-none shadow-sm group-hover:shadow-md"
                />
                <div className="absolute bottom-4 right-4">
                  <button
                    onClick={handleSuggest}
                    disabled={!ingredients.trim()}
                    className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-orange-200 active:scale-95"
                  >
                    开始推荐
                    <ArrowRight size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                  <h4 className="font-bold text-orange-700 mb-1 flex items-center gap-2">
                    <Utensils size={16} /> 简单快捷
                  </h4>
                  <p className="text-sm text-orange-600/80">所有推荐均为15分钟内可完成的快手餐品。</p>
                </div>
                <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
                  <h4 className="font-bold text-green-700 mb-1 flex items-center gap-2">
                    <Heart size={16} /> 营养均衡
                  </h4>
                  <p className="text-sm text-green-600/80">智能搭配，确保每一餐都健康美味。</p>
                </div>
              </div>
            </motion.div>
          ) : state === "suggestions" ? (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-gray-900">为您推荐以下美味</h2>
                <p className="text-gray-500">点击您想尝试的菜品开始烹饪</p>
              </div>

              <div className="grid gap-6">
                {meals.map((meal, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    onClick={() => handleSelectMeal(meal)}
                    className="group relative flex flex-col md:flex-row items-center gap-6 p-4 bg-white rounded-3xl border-2 border-transparent hover:border-orange-200 hover:shadow-xl transition-all text-left overflow-hidden"
                  >
                    <div className="w-full md:w-48 h-48 rounded-2xl overflow-hidden flex-shrink-0">
                      <img 
                        src={meal.imageUrl} 
                        alt={meal.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className="flex-grow space-y-2">
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
                        {meal.name}
                      </h3>
                      <p className="text-gray-500 leading-relaxed">
                        {meal.description}
                      </p>
                      <div className="pt-2 flex items-center text-orange-500 font-bold text-sm">
                        查看烹饪步骤 <ChevronRight size={16} />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : state === "cooking" && selectedMeal ? (
            <motion.div
              key="cooking"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedMeal.name}</h2>
                  <p className="text-orange-500 font-medium">
                    第 {currentStep + 1} 步 / 共 {selectedMeal.steps?.length} 步
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="p-3 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    onClick={nextStep}
                    className="p-3 rounded-full bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-100 transition-all"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>
              </div>

              <div className="relative aspect-square rounded-[2.5rem] overflow-hidden shadow-2xl bg-white border-8 border-white">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={currentStep}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.4 }}
                    src={selectedMeal.stepImages?.[currentStep]}
                    alt={`Step ${currentStep + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </AnimatePresence>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-8">
                  <motion.p 
                    key={currentStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-white text-xl font-medium leading-relaxed"
                  >
                    {selectedMeal.steps?.[currentStep]}
                  </motion.p>
                </div>
              </div>

              <div className="flex gap-1">
                {selectedMeal.steps?.map((_, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "h-1.5 flex-grow rounded-full transition-all duration-500",
                      idx <= currentStep ? "bg-orange-500" : "bg-gray-200"
                    )}
                  />
                ))}
              </div>
            </motion.div>
          ) : state === "finish" ? (
            <motion.div
              key="finish"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-8 py-10"
            >
              <div className="relative inline-block">
                <div className="absolute -inset-4 bg-orange-100 rounded-full blur-2xl opacity-50 animate-pulse" />
                <div className="relative aspect-square w-64 h-64 rounded-full overflow-hidden border-8 border-white shadow-2xl mx-auto">
                  <img 
                    src={selectedMeal?.imageUrl} 
                    alt="Finished dish"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-4xl font-black text-orange-600 tracking-tight">
                  大功告成！
                </h2>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-orange-50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Utensils size={80} className="text-orange-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-800 relative z-10">
                    再忙也要好好吃饭哦 ❤️
                  </p>
                </div>
              </div>

              <button
                onClick={reset}
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl active:scale-95"
              >
                <RotateCcw size={20} />
                再做一顿
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Footer Decoration */}
      <footer className="fixed bottom-0 left-0 right-0 pointer-events-none opacity-20">
        <div className="max-w-2xl mx-auto flex justify-between px-10 py-4">
          <Utensils size={40} className="text-orange-200" />
          <ChefHat size={40} className="text-orange-200" />
        </div>
      </footer>
    </div>
  );
}
