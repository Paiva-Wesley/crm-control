import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, children, maxWidth = '500px' }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                className="relative w-full bg-dark-800 border border-dark-700 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in duration-200"
                style={{ maxWidth }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-dark-700">
                    <h3 className="text-xl font-semibold text-slate-100">{title}</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-8 w-8 p-0"
                    >
                        <X size={20} />
                    </Button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
